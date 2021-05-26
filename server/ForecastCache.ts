import geolib = require('geolib')
import moment = require('moment')
import * as R from 'ramda'
import L = require('partial.lenses')

import {PointForecast, Coords, AreaForecast, Bounds, ForecastItem} from "./ForecastDomain"
import * as GribReader from './GribReader'
import * as Utils from './Utils'
import { consoleLogger as logger } from './Logging'

const LAT_GRID_INCREMENT = 0.2
const LNG_GRID_INCREMENT = 0.5
let cachedForecast: AreaForecast


export function getAreaForecast(): AreaForecast { return cachedForecast }

export function getBoundedAreaForecast(bounds: Bounds, startTime: Date = new Date(0)): AreaForecast {
  const corners = [
    {latitude: bounds.swCorner.latitude, longitude: bounds.swCorner.longitude},
    {latitude: bounds.neCorner.latitude, longitude: bounds.swCorner.longitude},
    {latitude: bounds.neCorner.latitude, longitude: bounds.neCorner.longitude},
    {latitude: bounds.swCorner.latitude, longitude: bounds.neCorner.longitude}
  ]

  return L.remove(['pointForecasts',
      L.elems,
      L.choose(forecast => forecastInBounds(forecast, corners)
        ? Utils.itemsBefore(startTime)                                 // PointForecast in bounds -> filter items by time
        : []                                                           // PointForecast out of bounds -> remove it itself
      )],
    cachedForecast)


  function forecastInBounds(forecast: PointForecast, corners: Coords[]): boolean {
    return geolib.isPointInside({latitude: forecast.latitude, longitude: forecast.longitude}, corners)
  }
}

export function refreshFrom(gribFile: string): Promise<void> {
  const startTime = new Date()
  logger.info('Refreshing forecast cache..')
  return GribReader.getGribTimestamp(gribFile)
    .then(timestamp => GribReader.getGribBounds(gribFile)
      .then(bounds => createForecastLocations(bounds, LAT_GRID_INCREMENT, LNG_GRID_INCREMENT))
      .then(forecastLocations => getPointForecastsForLocations(forecastLocations, gribFile))
      .then(pointForecasts => { cachedForecast = { publishTime: timestamp, pointForecasts } })
      .then(() => { logger.info('Forecast cache refreshed in ' + (new Date().getTime() - startTime.getTime()) + 'ms. Contains ' + cachedForecast.pointForecasts.length + ' points.')})
    )

  function getPointForecastsForLocations(locations: Coords[], gribFile: string): Promise<PointForecast[]> {
    return Promise.all(locations.map(location => GribReader.getPointForecastFromGrib(gribFile, location.latitude, location.longitude)))
  }

  function createForecastLocations(bounds: Bounds, latIncrement: number, lngIncrement: number): Coords[] {
    const latitudes = Utils.rangeStep(bounds.swCorner.latitude, bounds.neCorner.latitude, latIncrement).map(roundTo1Decimal)
    const longitudes = Utils.rangeStep(bounds.swCorner.longitude, bounds.neCorner.longitude, lngIncrement).map(roundTo1Decimal)

    return R.flatten<Coords>(latitudes.map(latitude => longitudes.map(longitude => ({latitude, longitude}))))
  }
}


function roundTo1Decimal(num: number): number {
  return Math.round(num * 10) / 10
}
