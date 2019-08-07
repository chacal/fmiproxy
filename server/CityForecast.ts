import * as Utils from './Utils'
import L = require('partial.lenses')
import R = require('ramda')
import { CityForecast } from './ForecastDomain'

const baseUrl = 'http://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::hirlam::surface::point::simple&&parameters=Temperature,Precipitation1h,WeatherSymbol3'


export function getCityForecast(city: string) {
  const url = baseUrl + '&place=' + city
  return Utils.getFmiXMLasJson(url)
    .then(parseCityForecast)
}

function parseCityForecast(json: any): CityForecast | undefined {
  if (json.ExceptionReport !== undefined) {
    return undefined
  }

  const members = L.collect(['wfs:FeatureCollection', 'wfs:member', L.elems, 'BsWfs:BsWfsElement', 0, L.props('BsWfs:ParameterName', 'BsWfs:ParameterValue', 'BsWfs:Time')], json)
  const grouped = R.groupBy(R.prop('BsWfs:Time'), members)
  const merged = R.mapObjIndexed((values, time) => ({
    temperature: parseFloat(getParameterValue('Temperature', values)),
    precipitation1h: parseFloat(getParameterValue('Precipitation1h', values)),
    weatherSymbol3: parseInt(getParameterValue('WeatherSymbol3', values)),
    date: new Date(time)
  }), grouped)

  return R.values(merged)

  function getParameterValue(paramName: string, values: any[]) {
    return values.find(v => v['BsWfs:ParameterName'][0] === paramName)['BsWfs:ParameterValue'][0]
  }
}