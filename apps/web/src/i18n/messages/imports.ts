import { defineMessages } from '../locales'

export const imports = defineMessages({
  'imports.gpxNoPoints': {
    en: 'The GPX file has no track points (<trkpt>).',
    'pt-BR': 'O arquivo GPX não contém pontos de trajeto (<trkpt>).',
  },
  'imports.csvInvalidRow': {
    en: 'Line {line} of the CSV does not contain a numeric "lat,lon".',
    'pt-BR': 'Linha {line} do CSV não contém "lat,lon" numérico.',
  },
  'imports.tooManyPoints': {
    en: '{source} exceeds the limit of {limit} points.',
    'pt-BR': 'O {source} excede o limite de {limit} pontos.',
  },
  'imports.notEnoughPoints': {
    en: '{source} needs at least 8 valid track points.',
    'pt-BR': 'O {source} precisa de pelo menos 8 pontos de trajeto válidos.',
  },
  'imports.trackTooShort': {
    en: 'The track log is {length} m — too short for a circuit.',
    'pt-BR': 'O trajeto tem {length} m — curto demais para uma pista.',
  },
  'imports.trackTooLong': {
    en: 'The track log is {length} km — longer than expected for karting.',
    'pt-BR': 'O trajeto tem {length} km — acima do esperado para kart.',
  },
  'imports.simplifiedTooFewPoints': {
    en: 'The simplified track log has fewer than 4 points; record a complete lap.',
    'pt-BR': 'O trajeto simplificado ficou com menos de 4 pontos; grave uma volta completa.',
  },

  'imports.imageTooLarge': {
    en: 'The image exceeds the {limit} MB limit.',
    'pt-BR': 'A imagem excede o limite de {limit} MB.',
  },
  'imports.imageWrongFormat': {
    en: 'Use a PNG or JPEG image of the circuit.',
    'pt-BR': 'Use uma imagem PNG ou JPEG da pista.',
  },
  'imports.imageReadFailed': {
    en: 'The selected image could not be read.',
    'pt-BR': 'Não foi possível ler a imagem selecionada.',
  },
  'imports.imageCanvasUnsupported': {
    en: 'This browser cannot process images.',
    'pt-BR': 'Este navegador não consegue processar imagens.',
  },
  'imports.calibrationDistanceRequired': {
    en: 'Enter a real-world distance greater than zero.',
    'pt-BR': 'Informe uma distância real maior que zero.',
  },
  'imports.calibrationPointsTooClose': {
    en: 'Mark two points farther apart on the image.',
    'pt-BR': 'Marque dois pontos mais afastados na imagem.',
  },
  'imports.calibrationScaleImplausible': {
    en: 'The resulting scale ({scale} m/px) is outside what is expected for a kart circuit.',
    'pt-BR': 'A escala resultante ({scale} m/px) está fora do esperado para uma pista de kart.',
  },
})
