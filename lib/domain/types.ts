export interface CropAdviceProfile {
    name: string;
    moistureMin: number | null;
    moistureMax: number | null;
    phMin: number | null;
    phMax: number | null;
    ecMax: number | null;
    frostRiskC: number | null;
  }
  export interface MoistureSample {
    sensorId: string;
    sensorName: string;
    value: number;
    time: string;
  }
  export interface SoilSample {
    ph: number | null;
    ec: number | null;
  }
  /** One hour of weather: rain and reference evapotranspiration (FAO-56 ET0), both in mm. */
  export interface WeatherHour {
    time: string;
    rainMm: number;
    et0Mm: number;
  }
  export interface ForecastHour extends WeatherHour {
    tempC: number;
  }
  export interface WeatherForecast {
    hours: ForecastHour[]; // the next 48 hours
    rainNext48hMm: number;
    overnightLowC: number;
    outlook: ForecastHour[]; // the next 5 days, for the water-by window
  }
  export interface WeekClimate {
    week: number;
    avgTempC: number;
    avgLowC: number;
    frostChancePct: number;
    avgRainMm: number;
  }
  export const STALE_MOISTURE_MS = 6 * 60 * 60 * 1000;
  export const HEAVY_RAIN_MM = 5;