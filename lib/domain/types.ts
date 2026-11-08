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
  export interface ForecastHour {
    time: string;
    tempC: number;
    rainMm: number;
  }
  export interface WeatherForecast {
    hours: ForecastHour[];
    rainNext48hMm: number;
    overnightLowC: number;
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