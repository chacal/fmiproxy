import Bluebird = require("bluebird")
import Victor = require('victor')
import moment = require('moment')
import R = require('ramda')
import L = require('partial.lenses')

import {PointForecast, ForecastItem, Bounds} from './ForecastDomain'
import * as Utils from './Utils'

export function getPointForecastFromGrib(gribPath: string, latitude: number, longitude: number, startTime: Date = new Date(0)): Bluebird<PointForecast> {
  return Utils.grib_get(['-p', 'shortName,dataDate,dataTime,forecastTime', '-l', latitude + ',' + longitude + ',1', gribPath])
    .then(stdout => parseForecastTimeAndItems(stdout, latitude, longitude))
    .then(forecast => L.remove(Utils.itemsBefore(startTime), forecast))
}

export function getGribBounds(gribFile: string): Bluebird<Bounds> {
  return Utils.grib_get(['-p', 'latitudeOfFirstGridPointInDegrees,longitudeOfFirstGridPointInDegrees,latitudeOfLastGridPointInDegrees,longitudeOfLastGridPointInDegrees', gribFile])
    .then(output => output.split('\n')[0])
    .then(line => {
      const coords = line.trim().split(/ /).map(parseFloat)
      return {swCorner: {lat: coords[0], lng: coords[1]}, neCorner: {lat: coords[2], lng: coords[3]}}
    })
}

export function getGribTimestamp(gribFile: string): Bluebird<Date> {
  return Utils.grib_get(['-p', 'dataDate,dataTime', gribFile])
    .then(output => {
      const parts = output.split(/\n/)[0].split(/ /)
      const dataDate = parts[0]
      const dataTime = parts[1]
      return Utils.parseFullHourlDateFromGribItemDateAndTime(dataDate, dataTime)
    })
    .catch(() => undefined)
}


/*
  For forecast format see ForecastItem
 */
function parseForecastTimeAndItems(gribGetOutput: string, lat: number, lng: number): PointForecast {
  const lines = getNonEmptySplittedStrings(gribGetOutput, /\n/)
  const rawGribData: RawGribDatum[] = lines.map(parseGribLine)
  const gribDataGroupedByTime: RawGribDatum[][] = R.pipe(R.groupBy(R.prop('time')), R.values)(rawGribData)
  const forecastItems = gribDataGroupedByTime.map(createForecastItem)
  const sortedForecastItems = R.sortBy(item => item.time, forecastItems)

  return { publishTime: sortedForecastItems[0].time, lat, lng, forecastItems: sortedForecastItems }


  interface RawGribDatum {
    name: string,
    time: Date,
    value: number
  }

  function parseGribLine(line) {
    const parts = getNonEmptySplittedStrings(line, / /)

    const datumName = parts[0]
    const date = parts[1]
    const time = parts[2]
    const timeIncrement = parts[3]
    const datumValue = parseFloat(parts[4])

    return {
      name: datumName,
      time: moment(Utils.parseFullHourlDateFromGribItemDateAndTime(date, time)).clone().add(timeIncrement, 'h').toDate(),
      value: datumValue
    }
  }

  function createForecastItem(dataForOneMoment: RawGribDatum[]): ForecastItem {
    const combinedItem = R.mergeAll(dataForOneMoment.map(createParsedDatum)) as { '10v': number, '10u': number, msl: number, prate: number, time: Date }

    const wind = new Victor(combinedItem['10v'], combinedItem['10u'])
    const windSpeedMs = +wind.length().toFixed(1)
    const windDir = Math.round(wind.horizontalAngleDeg() + 180)
    const pressureMbar = +(combinedItem.msl / 100).toFixed(1)

    return {
      prate: combinedItem.prate,
      windSpeedMs,
      windDir,
      pressureMbar,
      time: combinedItem.time
    }

    function createParsedDatum(datum: RawGribDatum) {
      return { time: datum.time, [datum.name]: datum.value }
    }
  }

  function getNonEmptySplittedStrings(s: string, splitter: RegExp): string[] { return s.split(splitter).filter(line => line.trim() !== '') }
}