var Bluebird = require('bluebird')
var fs = Bluebird.promisifyAll(require('fs'))
import requestP = require('request-promise')
var xml2js = Bluebird.promisifyAll(require('xml2js'))
var mkdirp = Bluebird.promisify(require('mkdirp'));
var _ = require('lodash')
var moment = require('moment')
var utils = require('./utils')
var logger = require('./logging.js').console

import GribCache = require('./grib_forecast_cache')

var gribDir = __dirname + '/../gribs'
var latestGrib = gribDir + '/latest.grb'
var gribUpdateCheckIntervalMillis = 10 * 60 * 1000

function initDownloader(apiKey) {
  logger.info("Initializing grib downloader.")

  return mkdirp(gribDir)
    .then(updateGribIfNeeded)
    .then(function(gribUpdated) { if(!gribUpdated) GribCache.refreshFrom(latestGrib) })  // No new grib downloaded -> need to refresh cache manually
    .then(function() {
      scheduleGribUpdates() // Intentionally no 'return' here to launch the grib updates to the background
    })

  function scheduleGribUpdates() {
    return Bluebird.delay(gribUpdateCheckIntervalMillis)
      .then(updateGribIfNeeded)
      .then(scheduleGribUpdates)
      .catch(scheduleGribUpdates)
  }

  function updateGribIfNeeded() {
    logger.info('Checking for new grib..')
    return Bluebird.join(getLatestDownloadedGribTimestamp(), getLatestPublishedGribTimestamp(), function(downloadedTime, publishedTime) {
      logger.info('Downloaded grib timestamp: ', downloadedTime, ' Latest published grib timestamp: ', publishedTime)
      return moment(downloadedTime).diff(moment(publishedTime)) === 0
    })
    .then(function(downloadedGribUpToDate) {
      if(! downloadedGribUpToDate) {
        return downloadLatestGrib()
          .then(function() { return true })
      } else {
        logger.info("Downloaded HIRLAM grib is already up-to-date.")
        return false
      }
    })
  }

  function getLatestDownloadedGribTimestamp() {
    return GribCache.getGribTimestamp(latestGrib)
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
    var gribUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/download?param=windvms,windums,pressure,precipitation1h&format=grib2&bbox=19.4,59.2,27,60.6&projection=EPSG:4326'
    logger.info("Downloading latest HIRLAM grib..")
    return requestP.get(gribUrl, { encoding: null })
      .then(function(res) {
        var gribFileBuffer = res.body
        if(gribFileBuffer.length === 0) {
          console.warn("Got empty response when downloading grib. Retrying..")
          return Bluebird.delay(5000).then(downloadLatestGrib)
        } else {
          return fs.writeFileAsync(latestGrib + '.tmp', gribFileBuffer)
            .then(function() {
              return fs.renameAsync(latestGrib + '.tmp', latestGrib)
            })
            .then(function() { logger.info('Successfully downloaded new grib file! (' + gribFileBuffer.length + ' bytes)') })
            .then(function() { GribCache.refreshFrom(latestGrib) })
        }
      })
  }
}


module.exports = {
  init: initDownloader,
  gribFile: latestGrib
}