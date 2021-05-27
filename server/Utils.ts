import child_process = require('child_process')
import L = require('partial.lenses')
import * as R from 'ramda'
import fetch from 'node-fetch'
import { parseStringPromise } from 'xml2js'
import { isBefore, parse, startOfHour } from 'date-fns'

import { Coords, ForecastItem } from './ForecastDomain'
import { ValidationChain, validationResult } from 'express-validator'
import { NextFunction, Request, Response } from 'express'

export function grib_get(params: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
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

export function getFmiXMLasJson(url: string): Promise<any> {
  return fetch(url)
    .then(res => res.text())
    .then(body => parseStringPromise(body))
}

export function coordinatesFromPositionString(position: string): Coords {
  const parts = position.trim().split(/ /)
  return { latitude: parseFloat(parts[0]), longitude: parseFloat(parts[1]) }
}

export function parseFullHourlDateFromGribItemDateAndTime(date: string, time: string): Date {
  // Return timestamp with one hour precision (ignores minutes)
  // Works correctly for time inputs: '0', '12', '600', '1600', '1230'
  // Assumes that the date & time are given in GMT time zone
  let hours = time
  if(time.length === 1) {
    hours = '0' + time + '00'
  } else if(time.length === 2) {
    hours = time + '00'
  } else if(time.length === 3) {
    hours = '0' + time
  }
  return startOfHour(parse(date + hours + 'Z', 'yyyyMMddHHmmX', new Date()))
}

export const itemsBefore = (time: Date) => ['forecastItems', L.elems, L.when(isItemBefore(time))]

export function isItemBefore(time: Date): (item: ForecastItem) => boolean {
  return item => isBefore(item.time, time)
}

export function rangeStep(start: number, stop: number, step: number = 1): number[] {
  return R.map(
    n => start + step * n,
    R.range(0, (1 + (stop - start) / step) >>> 0)
  )
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function validateRequest(validations: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)))

    const errors = validationResult(req)
    if (errors.isEmpty()) {
      return next()
    }
    return next(errors)
  }
}
