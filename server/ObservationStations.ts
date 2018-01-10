import Bluebird = require("bluebird")
import request = require('request')
import geolib = require('geolib')
import moment = require('moment')
import xpath = require('xpath')
import R = require('ramda')
import { DOMParser } from 'xmldom'

import {ObservationStation, NearestObservationStation} from "./ForecastDomain"
import * as Utils from './Utils'
import { consoleLogger as logger } from './Logging'
const marineStationNames = require('../marine-observation-stations').map(R.prop('name'))

let observationStations: ObservationStation[] = []
let marineObservationStations: ObservationStation[] = []

export function init(apiKey): Bluebird<void> {
  logger.info("Updating observation station cache..")
  const lastFullHour = moment().minutes(0).seconds(0).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z"
  const observationsUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::forecast::hirlam::surface::obsstations::multipointcoverage&parameters=temperature&starttime=' + lastFullHour + '&endtime=' + lastFullHour

  return Bluebird.fromCallback(cb => request.get(observationsUrl, cb), {multiArgs: true})
    .then(([res, body]) => {
      const doc = new DOMParser().parseFromString(body.toString())
      const select = xpath.useNamespaces({
        target: 'http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.0',
        gml: 'http://www.opengis.net/gml/3.2',
        xlink: 'http://www.w3.org/1999/xlink'
      })
      const locationNodes: any[] = select("//target:Location", doc)
      return locationNodes.map(createObservationStation)

      function createObservationStation(locationNode): ObservationStation {
        const name: string = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/name"]/text()', locationNode).toString()
        const geoid: string = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/geoid"]/text()', locationNode).toString()
        const poinRef = select('./target:representativePoint/@xlink:href', locationNode, true).value.substr(1)
        const position = select('//gml:Point[@gml:id="' + poinRef + '"]/gml:pos/text()', doc, true).toString()
        const {latitude, longitude} = Utils.coordinatesFromPositionString(position)
        return {geoid, name, latitude, longitude}
      }
    })
    .then(stations => {
      observationStations = stations
      marineObservationStations = observationStations.filter(s => R.contains(s.name, marineStationNames))
      logger.info(`Loaded ${stations.length} observation stations (${marineObservationStations.length} marine).`)
    })
}

export function getNearestStation(latitude: number, longitude: number, marineStationsOnly: boolean = false): NearestObservationStation {
  const haystack = marineStationsOnly ? marineObservationStations : observationStations
  const nearest = geolib.findNearest({latitude, longitude}, haystack) as any  // Typings for geolib are wrong
  return R.merge({ distanceMeters: nearest.distance }, haystack[nearest.key] as any)
}
