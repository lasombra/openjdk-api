const assert = require('assert');
const _ = require('underscore');
const fs = require('fs');
const Q = require('q');

setUpTestCache();


function setUpTestCache() {

  if (!fs.existsSync('cache')) {
    fs.mkdirSync('cache');
  }
  fs.writeFileSync('./cache/newCache.cache.json', fs.readFileSync('./test/asset/cache/newCache.cache.json'));
  fs.writeFileSync('./cache/oldCache.cache.json', fs.readFileSync('./test/asset/cache/oldCache.cache.json'));
  console.log('Test cache setup')
}

const v2 = require('../app/routes/v2');


function mockRequest(requestType, buildtype, version, openjdk_impl, os, arch, release, type, heap_size) {
  return {
    params: {
      requestType: requestType,
      buildtype: buildtype,
      version: version,
    },

    query: {
      openjdk_impl: openjdk_impl,
      os: os,
      arch: arch,
      release: release,
      type: type,
      heap_size: heap_size,
    }
  }
}


function mockRequestWithSingleQuery(requestType, buildtype, version, queryName, queryValue) {
  let request = mockRequest(requestType, buildtype, version);
  request.query[queryName] = queryValue;
  return request;
}

function performRequest(request, doAssert) {
  var codePromise = Q.defer();
  var msgPromise = Q.defer();
  var res = {
    status: function (code) {
      codePromise.resolve(code);
    },
    send: function (msg) {
      msgPromise.resolve(msg);
    },
    json: function (msg) {
      msgPromise.resolve(JSON.stringify(msg));
    }, redirect: function (url) {
      codePromise.resolve(302);
      msgPromise.resolve(url);
    }
  };

  v2(request, res);

  return Q
    .allSettled([codePromise.promise, msgPromise.promise])
    .then(function (result) {
      var code = result[0].value;
      var msg = result[1].value;
      doAssert(code, msg);
    });
}


function forAllPermutations(doTest) {
  _
    .chain(["openjdk8", "openjdk9", "openjdk10"])
    .each(function (jdk) {
      _
        .chain(["nightly", "releases"])
        .each(function (release) {
          // Remove when we produce openjdk9 releases
          if (jdk === "openjdk9" && release === "releases") {
            return;
          }
          doTest(jdk, release);

        })
    });
}


/*

TODO: uncomment when fixed
describe('dinoguns binary request works', function () {
  it("works", function () {
    const request = mockRequest("binary", "nightly", "openjdk8", "hotspot", "linux", "aarch64", "latest", "jdk");
    return performRequest(request, function (code, msg) {
      assert.equal(302, code);
    });
  })
});
*/

//request http://localhost:3000/info/release/openjdk8
describe('200 for simple case', function () {
  forAllPermutations(function (jdk, release) {
    it(jdk + ' ' + release, function () {
      const request = mockRequest("info", release, jdk);
      return performRequest(request, function (code, msg) {
        assert.equal(200, code);
      });
    })
  });
});


//request http://localhost:3000/info/release/openjdk8
describe('has all expected properties on binary assets', function () {
  forAllPermutations(function (jdk, release) {
    it(jdk + ' ' + release, function () {

      const request = mockRequest("info", release, jdk);
      return performRequest(request, function (code, msg) {
        assert.equal(200, code);
        let releases
        try {
          releases = JSON.parse(msg);
        } catch (e) {
          console.log("Failed to read :" + msg);
          assert.fail()
        }

        _.chain(releases)
          .map(function (release) {
            return release.binaries;
          })
          .flatten()
          .each(function (binary) {

            _.chain([
              "architecture",
              "binary_link",
              "binary_name",
              "binary_size",
              "binary_type",
              "heap_size",
              "openjdk_impl",
              "os",
              "version"])
              .each(function (property) {
                assert.equal(true, binary.hasOwnProperty(property), "missing property " + property + " on json: " + JSON.stringify(binary));
              });
          })
      });
    })
  });
});

function checkCanFilterOnProperty(propertyName, returnedPropertyName, propertyValue) {
  forAllPermutations(function (jdk, release) {
    const request = mockRequestWithSingleQuery("info", release, jdk, propertyName, propertyValue);
    it('Checking can filter for params: ' + jdk + ' ' + release + ' ' + propertyName + ' ' + propertyValue, function () {
      return performRequest(request, function (code, msg) {
        assert.equal(200, code);
        let releases = JSON.parse(msg);
        _.chain(releases)
          .map(function (release) {
            return release.binaries;
          })
          .flatten()
          .each(function (binary) {
            assert.equal(propertyValue, binary[returnedPropertyName]);
          })
      });
    })
  });
}

//request http://localhost:3000/info/release/openjdk8?os=windows
describe('can filter on os', function () {
  checkCanFilterOnProperty("os", "os", "windows");
});

//request http://localhost:3000/info/release/openjdk8?openjdk_impl=hotspot
describe('can filter on openjdk_impl', function () {
  checkCanFilterOnProperty("openjdk_impl", "openjdk_impl", "hotspot")
});

//request http://localhost:3000/info/release/openjdk8?arch=x64
describe('can filter on arch', function () {
  checkCanFilterOnProperty("arch", "architecture", "x64")
});

//request http://localhost:3000/info/release/openjdk8?type=jdk
describe('can filter on type', function () {
  checkCanFilterOnProperty("type", "binary_type", "jdk")
});

describe('binary redirect returns 302', function () {
  forAllPermutations(function (jdk, release) {
    const request = mockRequest("binary", release, jdk, "hotspot", "linux", "x64", "latest", "jdk");

    it('returns 302 for redirect ' + JSON.stringify(request), function () {
      return performRequest(request, function (code, msg) {
        assert.equal(302, code);
      })
    });
  })
});

describe('filters releases correctly', function () {
  forAllPermutations(function (jdk, release) {
    const request = mockRequest("info", release, jdk, "hotspot", "linux", "x64", undefined, "jdk");

    var isRelease = release.indexOf("releases") >= 0;

    it('release is set correctly ' + JSON.stringify(request), function () {
      return performRequest(request, function (code, data) {
        let releases = JSON.parse(data);
        _.chain(releases)
          .each(function (release) {
            if (release.hasOwnProperty('binaries')) {
              _.chain(releases.binaries)
                .each(function (binary) {
                  var isNightlyRepo = binary.binary_link.indexOf("-nightly") >= 0;
                  var isBinaryRepo = binary.binary_link.indexOf("-binaries") >= 0;
                  if (isRelease) {
                    assert.equal(false, isNightlyRepo)
                  } else {
                    assert.equal(true, isNightlyRepo || isBinaryRepo)
                  }
                })
            }

            assert.equal(isRelease, release.release);
          })
      })
    });
  })
});

describe('filters heap_size', function () {
  const request = mockRequest("info", "nightly", "openjdk8", undefined, undefined, undefined, undefined, undefined, "large");
  it('only large heaps are returned', function () {
    return performRequest(request, function (code, data) {
      let releases = JSON.parse(data);
      _.chain(releases)
        .each(function (release) {
          if (release.hasOwnProperty('binaries')) {
            _.chain(releases.binaries)
              .each(function (binary) {
                assert.equal(true, binary.binary_link.indexOf("linuxXL") >= 0);
                assert.equal("large", binary.heap_size);
              })
          }
        })
    })
  });
});

