import { defineMessages } from '../locales'

export const project = defineMessages({
  'project.backgroundTooLarge': {
    en: 'The background image was too large for the file; the geometry and calibration were saved.',
    'pt-BR': 'A imagem de fundo era grande demais para o arquivo; a geometria e a calibração foram salvas.',
  },
  'project.invalidNumber': {
    en: '{field} must be a valid number.',
    'pt-BR': '{field} precisa ser um número válido.',
  },
  'project.field.width': { en: 'Width', 'pt-BR': 'Largura' },
  'project.field.imageWidth': { en: 'Image width', 'pt-BR': 'Largura da imagem' },
  'project.field.imageHeight': { en: 'Image height', 'pt-BR': 'Altura da imagem' },
  'project.field.pointX': { en: 'Point {index} x', 'pt-BR': 'Ponto {index} x' },
  'project.field.pointY': { en: 'Point {index} y', 'pt-BR': 'Ponto {index} y' },
  'project.field.power': { en: 'Power', 'pt-BR': 'Potência' },
  'project.field.kartMass': { en: 'Kart mass', 'pt-BR': 'Massa do kart' },
  'project.field.driverMass': { en: 'Driver mass', 'pt-BR': 'Massa do piloto' },
  'project.field.topSpeed': { en: 'Top speed', 'pt-BR': 'Velocidade máxima' },
  'project.field.grip': { en: 'Grip', 'pt-BR': 'Aderência' },
  'project.field.braking': { en: 'Braking', 'pt-BR': 'Frenagem' },
  'project.field.safetyMargin': { en: 'Safety margin', 'pt-BR': 'Margem de segurança' },
  'project.field.sampleCount': { en: 'Samples', 'pt-BR': 'Amostras' },
  'project.field.totalMass': { en: 'Total mass', 'pt-BR': 'Massa total' },
  'project.malformedBackground': {
    en: "The project's background is malformed.",
    'pt-BR': 'O plano de fundo do projeto está mal formado.',
  },
  'project.invalidBackgroundDimensions': {
    en: 'The background image dimensions are invalid.',
    'pt-BR': 'As dimensões da imagem de fundo são inválidas.',
  },
  'project.invalidBackgroundScale': {
    en: 'The background image scale is invalid.',
    'pt-BR': 'A escala da imagem de fundo é inválida.',
  },
  'project.exceedsSizeLimit': {
    en: 'The project exceeds the 1 MiB limit.',
    'pt-BR': 'O projeto excede o limite de 1 MiB.',
  },
  'project.invalidJson': {
    en: 'The file does not contain valid JSON.',
    'pt-BR': 'O arquivo não contém JSON válido.',
  },
  'project.missingVersion': { en: 'missing', 'pt-BR': 'ausente' },
  'project.unsupportedVersion': {
    en: 'Unsupported project version: {version}.',
    'pt-BR': 'Versão de projeto não suportada: {version}.',
  },
  'project.invalidMetadata': {
    en: 'The project metadata is missing or invalid.',
    'pt-BR': 'Os metadados do projeto estão ausentes ou inválidos.',
  },
  'project.missingCenterline': {
    en: 'The file must contain a centerline with at least 4 points.',
    'pt-BR': 'O arquivo precisa conter uma linha central com pelo menos 4 pontos.',
  },
  'project.missingKartOrSimulation': {
    en: 'The file is missing the kart and simulation settings.',
    'pt-BR': 'O arquivo não contém kart e configuração de simulação.',
  },
  'project.unsupportedCoordinateSystem': {
    en: "The project's coordinate system is not supported.",
    'pt-BR': 'O sistema de coordenadas do projeto não é suportado.',
  },
  'project.invalidDirection': {
    en: 'The track direction must be clockwise or counterclockwise.',
    'pt-BR': 'O sentido da pista precisa ser horário ou anti-horário.',
  },
  'project.unsupportedModel': {
    en: "The project's kart model or solver is not supported.",
    'pt-BR': 'O modelo de kart ou solver do projeto não é suportado.',
  },
  'project.invalidPoint': {
    en: 'Point {index} is invalid.',
    'pt-BR': 'Ponto {index} inválido.',
  },
  'project.massMismatch': {
    en: "Total mass doesn't match the sum of kart and driver mass.",
    'pt-BR': 'A massa total não corresponde à soma do kart e do piloto.',
  },
  'project.eventBrake': { en: 'Brake at {distance} m', 'pt-BR': 'Frear em {distance} m' },
  'project.eventApex': { en: 'Apex · {speed} km/h', 'pt-BR': 'Ápice · {speed} km/h' },
  'project.eventThrottle': { en: 'Throttle at {distance} m', 'pt-BR': 'Acelerar em {distance} m' },
  'project.warningMvpEstimate': {
    en: 'MVP physics-engine estimate; validate the reference lines gradually on track.',
    'pt-BR': 'Estimativa do motor físico MVP; valide as referências gradualmente na pista.',
  },
  'project.warningNarrowTrack': {
    en: "Narrow track: there's little margin available to adjust the racing line.",
    'pt-BR': 'Pista estreita: a margem disponível para ajustar a trajetória é pequena.',
  },
  'project.warningNotConverged': {
    en: "The racing line didn't reach the convergence criterion; the line returned is feasible, but isn't reported as converged.",
    'pt-BR':
      'A trajetória não atingiu o critério de convergência; a linha retornada é factível, mas não é reportada como convergida.',
  },
})
