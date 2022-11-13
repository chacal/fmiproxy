import fsExtraP = require('fs-extra-promise')
import L = require('partial.lenses')
import fetch from 'node-fetch'
import { isAfter, isEqual } from 'date-fns'

import * as Utils from './Utils'
import { delay } from './Utils'
import * as GribReader from './GribReader'
import * as ForecastCache from './ForecastCache'
import { logger } from './Logging'

const gribUpdateCheckIntervalMillis = 10 * 60 * 1000
const gribDir = __dirname + '/../gribs'

export const latestGribFile = gribDir + '/latest.grb'

export function init(): Promise<void> {
  logger.info('Initializing grib downloader.')

  return fsExtraP.mkdirsAsync(gribDir)
    .then(updateGribIfNeeded)
    .then(gribUpdated => {
      if (!gribUpdated) ForecastCache.refreshFrom(latestGribFile)
    })  // No new grib downloaded -> need to refresh cache manually
    .then(() => {
      scheduleGribUpdates()
    })  // Intentionally no 'return' here to launch the grib updates to the background

  function scheduleGribUpdates(): Promise<void> {
    return delay(gribUpdateCheckIntervalMillis)
      .then(updateGribIfNeeded)
      .then(scheduleGribUpdates)
      .catch(scheduleGribUpdates)
  }

  function updateGribIfNeeded(): Promise<boolean> {
    logger.info('Checking for new grib..')
    return Promise.all([getLatestDownloadedGribTimestamp(), getLatestPublishedGribTimestamp()])
      .then(([downloadedTime, publishedTime]) => {
        logger.info(`Downloaded grib timestamp: ${downloadedTime} Latest published grib timestamp: ${publishedTime}`)
        return isAfter(downloadedTime, publishedTime) || isEqual(downloadedTime, publishedTime)
      })
      .then(downloadedGribUpToDate => {
        if (!downloadedGribUpToDate) {
          return downloadLatestGrib().then(() => true)
        } else {
          logger.info('Downloaded HARMONIE grib is already up-to-date.')
          return false
        }
      })
  }

  function getLatestDownloadedGribTimestamp(): Promise<Date> {
    return GribReader.getGribTimestamp(latestGribFile)
  }

  function getLatestPublishedGribTimestamp(): Promise<Date> {
    const gribMetadataUrl = 'http://opendata.fmi.fi/wfs?request=GetFeature&storedquery_id=fmi::forecast::harmonie::surface::grid'
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

  function downloadLatestGrib(): Promise<void> {
    const gribUrl = 'http://opendata.fmi.fi/download?producer=harmonie_scandinavia_surface&param=WindVMS,WindUMS,Pressure,PrecipitationAmount&format=grib2&bbox=19.4,59.2,27,60.6&projection=EPSG:4326'
    logger.info('Downloading latest HARMONIE grib..')
    return fetch(gribUrl)
      .then(res => res.buffer())
      .then(gribFileBuffer => {
        if (gribFileBuffer.length === 0) {
          logger.warn('Got empty response when downloading grib. Retrying..')
          return delay(5000).then(downloadLatestGrib)
        } else {
          return fsExtraP.writeFileAsync(latestGribFile + '.tmp', gribFileBuffer)
            .then(() => fsExtraP.renameAsync(latestGribFile + '.tmp', latestGribFile))
            .then(() => logger.info(`Successfully downloaded new grib file! (${gribFileBuffer.length} bytes)`))
            .then(() => ForecastCache.refreshFrom(latestGribFile))
        }
      })
  }
}
