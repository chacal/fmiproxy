var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var request = Promise.promisifyAll(require('request'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var child_process = require('child_process')


function grib_get(params) {
  return new Promise(function (resolve, reject) {
    var grib_get = child_process.spawn('grib_get', params)
    var output = ""
    var errorOutput = ""

    grib_get.on('error', function(err) { reject(err) })
    grib_get.on('exit', function(code) {
      if(code === 0) {
        resolve(output)
      } else {
        reject({message: 'grib_get exited with error ' + code + ':\n' + errorOutput})
      }
    })
    grib_get.stderr.on('data', function(chunk) { errorOutput = errorOutput + chunk })
    grib_get.stdout.on('data', function(chunk) { output = output + chunk })
  })
}


module.exports = {
  grib_get: grib_get
}