import Bluebird = require('bluebird')
import fsExtraP = require('fs-extra-promise')
import L = require('partial.lenses')
import moment = require('moment')
import request = require('request')

import * as Utils from './Utils'
import * as GribReader from './GribReader'
import * as ForecastCache from './ForecastCache'
import { consoleLogger as logger } from './Logging'

const gribUpdateCheckIntervalMillis = 10 * 60 * 1000
const gribDir = __dirname + '/../gribs'

export const latestGribFile = gribDir + '/latest.grb'

export function init(apiKey): Bluebird<void> {
  logger.info("Initializing grib downloader.")

  return fsExtraP.mkdirsAsync(gribDir)
    .then(updateGribIfNeeded)
    .then(gribUpdated => { if(!gribUpdated) ForecastCache.refreshFrom(latestGribFile) })  // No new grib downloaded -> need to refresh cache manually
    .then(() => { scheduleGribUpdates() })  // Intentionally no 'return' here to launch the grib updates to the background

  function scheduleGribUpdates(): Bluebird<void> {
    return Bluebird.delay(gribUpdateCheckIntervalMillis)
      .then(updateGribIfNeeded)
      .then(scheduleGribUpdates)
      .catch(scheduleGribUpdates)
  }

  function updateGribIfNeeded(): Bluebird<boolean> {
    logger.info('Checking for new grib..')
    return Bluebird.join(getLatestDownloadedGribTimestamp(), getLatestPublishedGribTimestamp(), (downloadedTime, publishedTime) => {
      logger.info('Downloaded grib timestamp: ', downloadedTime, ' Latest published grib timestamp: ', publishedTime)
      return moment(downloadedTime || 0).isSameOrAfter(moment(publishedTime))
    })
    .then(downloadedGribUpToDate => {
      if(! downloadedGribUpToDate) {
        return downloadLatestGrib().then(() => true)
      } else {
        logger.info("Downloaded HIRLAM grib is already up-to-date.")
        return false
      }
    })
  }

  function getLatestDownloadedGribTimestamp(): Bluebird<Date> { return GribReader.getGribTimestamp(latestGribFile) }

  function getLatestPublishedGribTimestamp(): Bluebird<Date> {
    const gribMetadataUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=GetFeature&storedquery_id=fmi::forecast::hirlam::surface::finland::grid'
    return Utils.getFmiXMLasJson(gribMetadataUrl)
      .then(json => {
        const last = L.choose(arr => L.index(arr.length - 1))

        const latestGribDate = L.get([
          'wfs:FeatureCollection', 'wfs:member', last,
          'omso:GridSeriesObservation', 0,
          'om:resultTime', 0,
          'gml:TimeInstant', 0,
          'gml:timePosition', 0
        ], json)
        return new Date(latestGribDate)
      })
  }

  function downloadLatestGrib(): Bluebird<void> {
    const gribUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/download?param=windvms,windums,pressure,precipitation1h&format=grib2&bbox=19.4,59.2,27,60.6&projection=EPSG:4326'
    logger.info("Downloading latest HIRLAM grib..")
    return Bluebird.fromCallback(cb => request.get(gribUrl, {encoding: null}, cb), {multiArgs: true})
      .then(([res, gribFileBuffer]) => {
        if(gribFileBuffer.length === 0) {
          console.warn("Got empty response when downloading grib. Retrying..")
          return Bluebird.delay(5000).then(downloadLatestGrib)
        } else {
          return fsExtraP.writeFileAsync(latestGribFile + '.tmp', gribFileBuffer)
            .then(() => fsExtraP.renameAsync(latestGribFile + '.tmp', latestGribFile))
            .then(() => logger.info('Successfully downloaded new grib file! (' + gribFileBuffer.length + ' bytes)'))
            .then(() => ForecastCache.refreshFrom(latestGribFile))
        }
      })
  }
}
