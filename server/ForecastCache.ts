import Bluebird = require("bluebird")
import geolib = require('geolib')
import moment = require('moment')
import R = require('ramda')
import L = require('partial.lenses')

import {PointForecast, Coords, AreaForecast, Bounds, ForecastItem} from "./ForecastDomain"
import * as GribReader from './GribReader'
import * as Utils from './Utils'
import { consoleLogger as logger } from './Logging'

const CPU_COUNT = require('os').cpus().length
const LAT_GRID_INCREMENT = 0.2
const LNG_GRID_INCREMENT = 0.5
let cachedForecast: AreaForecast


export function getAreaForecast(bounds: Bounds, startTime: Date = new Date(0)): AreaForecast {
  const corners = [
    {lat: bounds.swCorner.lat, lng: bounds.swCorner.lng},
    {lat: bounds.neCorner.lat, lng: bounds.swCorner.lng},
    {lat: bounds.neCorner.lat, lng: bounds.neCorner.lng},
    {lat: bounds.swCorner.lat, lng: bounds.neCorner.lng}
  ]

  return L.remove(['pointForecasts',
      L.elems,
      L.choose(forecast => forecastInBounds(forecast, corners)
        ? Utils.itemsBefore(startTime)                                 // PointForecast in bounds -> filter items by time
        : []                                                           // PointForecast out of bounds -> remove it itself
      )],
    cachedForecast)


  function isItemBefore(time: Date) {
    return (item: ForecastItem) => moment(item.time).isBefore(moment(time))
  }

  function forecastInBounds(forecast: PointForecast, corners: Coords[]): boolean {
    return geolib.isPointInside({latitude: forecast.lat, longitude: forecast.lng}, corners)
  }
}

export function refreshFrom(gribFile: string): Bluebird<void> {
  const startTime = new Date()
  logger.info('Refreshing forecast cache..')
  return GribReader.getGribTimestamp(gribFile)
    .then(timestamp => GribReader.getGribBounds(gribFile)
      .then(bounds => createForecastLocations(bounds, LAT_GRID_INCREMENT, LNG_GRID_INCREMENT))
      .then(forecastLocations => getPointForecastsForLocations(forecastLocations, gribFile))
      .then(pointForecasts => { cachedForecast = { publishTime: timestamp, pointForecasts } })
      .then(() => { logger.info('Forecast cache refreshed in ' + (new Date().getTime() - startTime.getTime()) + 'ms. Contains ' + cachedForecast.pointForecasts.length + ' points.')})
    )

  function getPointForecastsForLocations(locations: Coords[], gribFile: string): Bluebird<PointForecast[]> {
    return Bluebird.map(locations, location => GribReader.getPointForecastFromGrib(gribFile, location.lat, location.lng), {concurrency: CPU_COUNT})
  }

  function createForecastLocations(bounds: Bounds, latIncrement: number, lngIncrement: number): Coords[] {
    const latitudes = Utils.rangeStep(bounds.swCorner.lat, bounds.neCorner.lat, latIncrement).map(roundTo1Decimal)
    const longitudes = Utils.rangeStep(bounds.swCorner.lng, bounds.neCorner.lng, lngIncrement).map(roundTo1Decimal)

    return R.flatten<Coords>(latitudes.map(lat => longitudes.map(lng => ({lat, lng}))))
  }
}


function roundTo1Decimal(num: number): number {
  return Math.round(num * 10) / 10
}
