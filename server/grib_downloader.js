var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var request = Promise.promisifyAll(require('request'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var mkdirp = Promise.promisify(require('mkdirp'));
var _ = require('lodash')
var child_process = require('child_process')
var moment = require('moment')

var gribDir = __dirname + '/../gribs'
var latestGrib = gribDir + '/latest.grb'

function init(apiKey) {
  console.log("Updating HIRLAM grib..")

  return mkdirp(gribDir)
    .then(function() {
      return Promise.join(getLatestDownloadedGribTimestamp(), getLatestPublishedGribTimestamp(), function(downloadedTime, publishedTime) {
        return moment(downloadedTime).diff(moment(publishedTime)) === 0
      })
    })
    .then(function(downloadedGribUpToDate) {
      if(! downloadedGribUpToDate) {
        return downloadLatestGrib()
      } else {
        console.log("Downloaded HIRLAM grib is already up-to-date.")
      }
    })

  function getLatestDownloadedGribTimestamp() {
    return fs.statAsync(latestGrib)
      .then(function() {
        return new Promise(function (resolve, reject) {
          var grib_get = child_process.spawn('grib_get', ['-p', 'dataDate,dataTime', latestGrib])
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
      })
      .then(function(output) {
        var parts = output.split(/\n/)[0].split(/ /)
        var dataDate = parts[0]
        var dataTime = parts[1]
        return moment(dataDate + dataTime + '+0000', 'YYYYMMDDHHmmZ').toDate()
      })
      .catch(function(err) {
        return undefined
      })
  }

  function getLatestPublishedGribTimestamp() {
    var gribMetadataUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=GetFeature&storedquery_id=fmi::forecast::hirlam::surface::finland::grid'
    return request.getAsync(gribMetadataUrl)
      .spread(function(res, body) {
        return xml2js.parseStringAsync(body)
      })
      .then(function(json) {
        var latestGribMetadata = _.last(_.get(json, 'wfs:FeatureCollection.wfs:member'))
        return new Date(_.get(latestGribMetadata, 'omso:GridSeriesObservation[0].om:resultTime[0].gml:TimeInstant[0].gml:timePosition[0]'))
      })
  }

  function downloadLatestGrib() {
    var gribUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/download?param=windvms,windums,pressure,precipitation1h&format=grib2&bbox=19.4,59.6,25.8,60.6&projection=EPSG:4326'
    console.log("Downloading latest HIRLAM grib...")
    return request.getAsync(gribUrl, { encoding: null })
      .spread(function(res, gribFileBuffer) {
        return fs.writeFileAsync(latestGrib + '.tmp', gribFileBuffer)
      })
      .then(function() {
        return fs.renameAsync(latestGrib + '.tmp', latestGrib)
      })
  }
}


module.exports = {
  init: init
}