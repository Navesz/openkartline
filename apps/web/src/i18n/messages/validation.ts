import { defineMessages } from '../locales'

export const validation = defineMessages({
  'validation.trackName': {
    en: 'Track name must be between 1 and {max} characters.',
    'pt-BR': 'O nome da pista deve ter entre 1 e {max} caracteres.',
  },
  'validation.controlPoints': {
    en: 'Use between {min} and {max} control points.',
    'pt-BR': 'Use entre {min} e {max} pontos de controle.',
  },
  'validation.invalidCoordinate': {
    en: 'Point {index} needs finite coordinates of up to {max} m.',
    'pt-BR': 'O ponto {index} precisa ter coordenadas finitas de até {max} m.',
  },
  'validation.width': {
    en: 'Track width must be greater than zero and at most {max} m.',
    'pt-BR': 'A largura deve ser maior que zero e no máximo {max} m.',
  },
  'validation.backgroundUncalibrated': {
    en: "The background image doesn't have a scale yet: use the Calibrate tool on the map before simulating.",
    'pt-BR': 'A imagem de fundo ainda não tem escala: use a ferramenta Calibrar no mapa antes de simular.',
  },
  'validation.kartMass': {
    en: 'Kart mass must be between {min} and {max} kg.',
    'pt-BR': 'A massa do kart deve ficar entre {min} e {max} kg.',
  },
  'validation.driverMass': {
    en: 'Driver mass must be between {min} and {max} kg.',
    'pt-BR': 'A massa do piloto deve ficar entre {min} e {max} kg.',
  },
  'validation.power': {
    en: 'Power must be between {min} and {max} hp.',
    'pt-BR': 'A potência deve ficar entre {min} e {max} hp.',
  },
  'validation.topSpeed': {
    en: 'Top speed must be between {min} and {max} km/h.',
    'pt-BR': 'A velocidade máxima deve ficar entre {min} e {max} km/h.',
  },
  'validation.grip': {
    en: 'Grip must be between {min} and {max}.',
    'pt-BR': 'A aderência deve ficar entre {min} e {max}.',
  },
  'validation.braking': {
    en: 'Braking must be between {min} and {max} m/s².',
    'pt-BR': 'A frenagem deve ficar entre {min} e {max} m/s².',
  },
  'validation.sampleCount': {
    en: 'Sample count must be an integer between {min} and {max}.',
    'pt-BR': 'A quantidade de amostras deve ser um inteiro entre {min} e {max}.',
  },
  'validation.safetyMargin': {
    en: 'Safety margin must be between 0 and {max} m.',
    'pt-BR': 'A margem de segurança deve ficar entre 0 e {max} m.',
  },
  'validation.noUsableCorridor': {
    en: 'With a {kartWidth} m wide kart, this margin leaves the track without a usable corridor.',
    'pt-BR': 'Com um kart de {kartWidth} m, essa margem deixa a pista sem corredor utilizável.',
  },
  'validation.minPoints': {
    en: 'Add at least 4 points to close the track.',
    'pt-BR': 'Adicione pelo menos 4 pontos para fechar a pista.',
  },
  'validation.widthPositive': {
    en: 'Width must be greater than zero.',
    'pt-BR': 'A largura deve ser maior que zero.',
  },
  'validation.invalidCoordinates': {
    en: 'The track contains invalid coordinates.',
    'pt-BR': 'A pista contém coordenadas inválidas.',
  },
  'validation.noUsableArea': {
    en: "The layout doesn't enclose a usable area.",
    'pt-BR': 'O traçado não forma uma área útil.',
  },
  'validation.pointsTooClose': {
    en: 'Points {a} and {b} are too close together.',
    'pt-BR': 'Os pontos {a} e {b} estão muito próximos.',
  },
  'validation.selfIntersecting': {
    en: 'The centerline crosses itself.',
    'pt-BR': 'A linha central cruza a si mesma.',
  },
})
