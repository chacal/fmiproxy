import Bluebird = require('bluebird')
import child_process = require('child_process')
import moment = require('moment')
import L = require('partial.lenses')
import R = require('ramda')
import request = require('request')

import {ForecastItem, Coords} from "./ForecastDomain"

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
  return Bluebird.fromCallback(cb => request.get(url, cb), {multiArgs: true})
    .then(([res, body]) => Bluebird.fromCallback(cb => require('xml2js').parseString(body, cb)))
}

export function coordinatesFromPositionString(position: string): Coords {
  const parts = position.trim().split(/ /)
  return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) }
}

export function parseFullHourlDateFromGribItemDateAndTime(date: string, time: string): Date {
  // Return timestamp with one hour precision (ignores minutes)
  // Works correctly for time inputs: '0', '12', '600', '1600', '1230'
  // Assumes that the date & time are given in GMT time zone
  const hours = (time.length === 1 || time.length === 3) ? '0' + time : time
  return moment(date + hours + '+0000', 'YYYYMMDDHHZ').toDate()
}

export const itemsBefore = (time: Date) => ['forecastItems', L.elems, L.when(isItemBefore(time))]

export function isItemBefore(time: Date): (item: ForecastItem) => boolean {
  return item => moment(item.time).isBefore(moment(time))
}

export function rangeStep(start: number, stop: number, step: number = 1): number[] {
  return R.map(
    n => start + step * n,
    R.range(0, (1 + (stop - start) / step) >>> 0)
  )
}
