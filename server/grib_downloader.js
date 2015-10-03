var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var request = Promise.promisifyAll(require('request'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var mkdirp = Promise.promisify(require('mkdirp'));
var _ = require('lodash')
var moment = require('moment')
var utils = require('./utils')
var gribCache = require('./grib_forecast_cache')

var gribDir = __dirname + '/../gribs'
var latestGrib = gribDir + '/latest.grb'
var gribUpdateCheckIntervalMillis = 10 * 60 * 1000

function init(apiKey) {
  console.log("Initializing grib downloader.")

  return mkdirp(gribDir)
    .then(updateGribIfNeeded)
    .then(function(gribUpdated) { if(!gribUpdated) gribCache.refreshFrom(latestGrib) })  // No new grib downloaded -> need to refresh cache manually
    .then(function() {
      scheduleGribUpdates() // Intentionally no 'return' here to launch the grib updates to the background
    })

  function scheduleGribUpdates() {
    return Promise.delay(gribUpdateCheckIntervalMillis)
      .then(updateGribIfNeeded)
      .then(scheduleGribUpdates)
      .catch(scheduleGribUpdates)
  }

  function updateGribIfNeeded() {
    console.log('Checking for new grib..')
    return Promise.join(getLatestDownloadedGribTimestamp(), getLatestPublishedGribTimestamp(), function(downloadedTime, publishedTime) {
      return moment(downloadedTime).diff(moment(publishedTime)) === 0
    })
    .then(function(downloadedGribUpToDate) {
      if(! downloadedGribUpToDate) {
        return downloadLatestGrib()
          .then(function() { return true })
      } else {
        console.log("Downloaded HIRLAM grib is already up-to-date.")
        return false
      }
    })
  }

  function getLatestDownloadedGribTimestamp() {
    return fs.statAsync(latestGrib)
      .then(function() {
        return utils.grib_get(['-p', 'dataDate,dataTime', latestGrib])
      })
      .then(function(output) {
        var parts = output.split(/\n/)[0].split(/ /)
        var dataDate = parts[0]
        var dataTime = parts[1]
        return moment(dataDate + dataTime + '+0000', 'YYYYMMDDHHmmZ').toDate()
      })
      .catch(function() {
        return undefined
      })
  }

  function getLatestPublishedGribTimestamp() {
    var gribMetadataUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=GetFeature&storedquery_id=fmi::forecast::hirlam::surface::finland::grid'
    return utils.getFmiXMLasJson(gribMetadataUrl)
      .then(function(json) {
        var latestGribMetadata = _.last(_.get(json, 'wfs:FeatureCollection.wfs:member'))
        return new Date(_.get(latestGribMetadata, 'omso:GridSeriesObservation[0].om:resultTime[0].gml:TimeInstant[0].gml:timePosition[0]'))
      })
  }

  function downloadLatestGrib() {
    var gribUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/download?param=windvms,windums,pressure,precipitation1h&format=grib2&bbox=19.4,59.6,25.8,60.6&projection=EPSG:4326'
    console.log("Downloading latest HIRLAM grib..")
    return request.getAsync(gribUrl, { encoding: null })
      .spread(function(res, gribFileBuffer) {
        if(gribFileBuffer.length === 0) {
          console.log("WARN: Got empty response when downloading grib. Retrying..")
          return Promise.delay(5000).then(downloadLatestGrib)
        } else {
          return fs.writeFileAsync(latestGrib + '.tmp', gribFileBuffer)
            .then(function() {
              return fs.renameAsync(latestGrib + '.tmp', latestGrib)
            })
            .then(function() { console.log('Successfully downloaded new grib file! (' + gribFileBuffer.length + ' bytes)') })
            .then(function() { gribCache.refreshFrom(latestGrib) })
        }
      })
  }
}


module.exports = {
  init: init,
  gribFile: latestGrib
}