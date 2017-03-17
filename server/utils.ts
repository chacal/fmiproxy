import {ForecastItem, PointForecast, Coords} from "./ForecastDomain"
import child_process = require('child_process')
var _ = require('lodash')
import moment = require('moment')
import requestP = require('request-promise')
import L = require('partial.lenses')
import R = require('ramda')
import Bluebird = require('bluebird')
const parseXml2JsAsync = Bluebird.promisify(require('xml2js').parseString)

export function grib_get(params: string[]): Bluebird<string> {
  return new Bluebird<string>((resolve, reject) => {
    const grib_get = child_process.spawn('grib_get', params)
    let output = ""
    let errorOutput = ""

    grib_get.on('error', err => reject(err))
    grib_get.on('close', code => {
      if(code === 0) {
        resolve(output)
      } else {
        reject({message: 'grib_get exited with error ' + code + ':\n' + errorOutput})
      }
    })
    grib_get.stderr.on('data', chunk => errorOutput += chunk)
    grib_get.stdout.on('data', chunk => output += chunk)
  })
}

export function getFmiXMLasJson(url: string): Bluebird<any> {
  return requestP.get(url)
    .then(parseXml2JsAsync)
}

export function locationFromPositionString(position: string): Coords {
  var position = position.trim()
  var latitude = position.substr(0, position.indexOf(' '))
  var longitude = position.trim().substr(position.indexOf(' ') + 1)
  return { lat: parseFloat(latitude), lng: parseFloat(longitude) }
}

export function parseHourlyTimestampFromGribItemDateAndTime(date, time) {
  // Return timestamp with one hour precision (ignores minutes)
  // Works correctly for time inputs: '0', '12', '600', '1600', '1230'
  // Assumes that the date & time are given in GMT time zone
  var time = (time.length === 1 || time.length === 3) ? '0' + time : time
  return moment(date + time + '+0000', 'YYYYMMDDHHZ')
}

export function removeOlderForecastItems(forecast: PointForecast, time: Date): PointForecast {
  return L.remove(['forecastItems', L.elems, L.when(isItemBeforeStartTime)], forecast)

  function isItemBeforeStartTime(item: ForecastItem) {
    return moment(item.time).isBefore(moment(time))
  }
}

export function rangeStep(start: number, stop: number, step: number = 1): number[] {
  return R.map(
    n => start + step * n,
    R.range(0, (1 + (stop - start) / step) >>> 0)
  )
}
