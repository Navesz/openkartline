import { defineMessages } from '../locales'

export const app = defineMessages({
  'app.title': {
    en: 'OpenKartLine — plan a faster lap',
    'pt-BR': 'OpenKartLine — planeje uma volta melhor',
  },
  'app.language': { en: 'Language', 'pt-BR': 'Idioma' },
  'app.skipToTrack': { en: 'Skip to the track', 'pt-BR': 'Pular para a pista' },

  'app.brandHome': { en: 'OpenKartLine — home', 'pt-BR': 'OpenKartLine — início' },
  // Same in every locale, keyed like `app.github` so the no-literals rule has
  // no exceptions to carve out.
  'app.brandName': { en: 'OpenKartLine', 'pt-BR': 'OpenKartLine' },
  'app.brandTagline': { en: 'RACING LINE LAB', 'pt-BR': 'RACING LINE LAB' },

  'app.engineTitleConnected': { en: 'API connected', 'pt-BR': 'API conectada' },
  'app.engineTitleLocal': { en: 'Local simulator active', 'pt-BR': 'Simulador local ativo' },
  'app.engineChecking': { en: 'Checking engine…', 'pt-BR': 'Verificando motor…' },
  'app.engineConnected': { en: 'MVP engine connected', 'pt-BR': 'Motor MVP conectado' },
  'app.engineLocal': { en: 'Local mode', 'pt-BR': 'Modo local' },
  'app.engineFieldRejected': {
    en: 'The engine rejected {field}: {reason}.',
    'pt-BR': 'O motor recusou {field}: {reason}.',
  },
  'app.engineHttpError': {
    en: 'The MVP physics engine responded with HTTP {status}.',
    'pt-BR': 'O motor físico MVP respondeu com HTTP {status}.',
  },
  'app.engineIncomplete': {
    en: 'The MVP physics engine did not complete the simulation.',
    'pt-BR': 'O motor físico MVP não concluiu a simulação.',
  },

  'app.projectActions': { en: 'Project actions', 'pt-BR': 'Ações do projeto' },
  'app.import': { en: 'Import', 'pt-BR': 'Importar' },
  'app.save': { en: 'Save', 'pt-BR': 'Salvar' },
  'app.github': { en: 'GitHub', 'pt-BR': 'GitHub' },
  'app.githubAria': {
    en: 'Open OpenKartLine on GitHub',
    'pt-BR': 'Abrir OpenKartLine no GitHub',
  },

  'app.introEyebrow': { en: 'TRAJECTORY PLANNING', 'pt-BR': 'PLANEJAMENTO DE TRAJETÓRIA' },
  'app.introTitle': { en: 'Plan a faster lap.', 'pt-BR': 'Planeje uma volta melhor.' },
  'app.introSubtitle': {
    en: 'Draw the track, describe your kart, and turn physics into references you can drive.',
    'pt-BR': 'Desenhe a pista, descreva seu kart e transforme física em referências práticas.',
  },
  'app.undo': { en: 'Undo (Ctrl+Z)', 'pt-BR': 'Desfazer (Ctrl+Z)' },
  'app.redo': { en: 'Redo (Ctrl+Y)', 'pt-BR': 'Refazer (Ctrl+Y)' },
  'app.restoreExample': { en: 'Restore example', 'pt-BR': 'Restaurar exemplo' },

  'app.runCalculating': { en: 'Calculating…', 'pt-BR': 'Calculando…' },
  'app.runRecalculate': { en: 'Recalculate lap', 'pt-BR': 'Recalcular volta' },
  'app.runAgain': { en: 'Simulate again', 'pt-BR': 'Simular novamente' },

  'app.footerTagline': {
    en: 'OpenKartLine · open, reproducible, and built for learning',
    'pt-BR': 'OpenKartLine · aberto, reproduzível e feito para aprender',
  },
  'app.footerDisclaimer': {
    en: 'The simulation is an estimate. Drive within your limits and the rules of the circuit.',
    'pt-BR': 'A simulação é uma estimativa. Pilote dentro dos seus limites e das regras da pista.',
  },
  'app.footerSource': { en: 'Open source', 'pt-BR': 'Código aberto' },

  'app.statusReady': { en: 'Example ready to explore.', 'pt-BR': 'Exemplo pronto para explorar.' },
  'app.statusPresetLoaded': {
    en: '{name} loaded. Adjust the points or run a simulation.',
    'pt-BR': '{name} carregado. Ajuste os pontos ou simule.',
  },
  'app.statusFixBeforeSimulating': {
    en: 'Fix the highlighted fields before simulating.',
    'pt-BR': 'Corrija os campos destacados antes de simular.',
  },
  'app.statusSolving': {
    en: 'Computing trajectory and speed profile…',
    'pt-BR': 'Calculando trajetória e perfil de velocidade…',
  },
  'app.statusSolvedStale': {
    en: 'Lap solved, but the track changed while it was running — recalculate for a current time.',
    'pt-BR': 'Volta calculada, mas a pista mudou durante o cálculo — recalcule para um tempo atual.',
  },
  'app.statusSolvedApi': {
    en: 'Reference computed by the MVP physics engine.',
    'pt-BR': 'Referência calculada pelo motor físico MVP.',
  },
  'app.statusSolvedLocal': {
    en: 'Reference computed locally in the browser.',
    'pt-BR': 'Referência calculada localmente no navegador.',
  },
  'app.statusSolveFailed': {
    en: 'The simulation could not be run.',
    'pt-BR': 'Não foi possível executar a simulação.',
  },
  'app.statusFixBeforeSaving': {
    en: 'Fix the highlighted fields before saving the project.',
    'pt-BR': 'Corrija os campos destacados antes de salvar o projeto.',
  },
  'app.statusProjectSaved': {
    en: 'Project .okl.json saved to your device.',
    'pt-BR': 'Projeto .okl.json salvo no seu dispositivo.',
  },
  'app.statusProjectTooLarge': {
    en: 'The project exceeds the 1 MiB limit.',
    'pt-BR': 'O projeto excede o limite de 1 MiB.',
  },
  'app.statusImportedNeedsScale': {
    en: '{name} imported. Calibrate the image scale (Calibrate tool) before simulating.',
    'pt-BR': '{name} importado. Calibre a escala da imagem (ferramenta Calibrar) antes de simular.',
  },
  'app.statusImported': {
    en: '{name} imported successfully.',
    'pt-BR': '{name} importado com sucesso.',
  },
  'app.statusInvalidFile': { en: 'Invalid file.', 'pt-BR': 'Arquivo inválido.' },
  'app.statusImageAdded': {
    en: 'Image added. Use the Calibrate tool to set the scale before simulating.',
    'pt-BR': 'Imagem adicionada. Use a ferramenta Calibrar para definir a escala antes de simular.',
  },
  'app.statusImageFailed': {
    en: 'The image could not be imported.',
    'pt-BR': 'Não foi possível importar a imagem.',
  },
  'app.statusImageRemoved': {
    en: 'Background image removed.',
    'pt-BR': 'Imagem de fundo removida.',
  },
  'app.statusScaleApplied': {
    en: 'Scale applied: {scale} m/px. Adjust the points and simulate.',
    'pt-BR': 'Escala aplicada: {scale} m/px. Ajuste os pontos e simule.',
  },
  'app.statusGpsImported': {
    en: 'GPS imported: {raw} points → {kept} control points, {km} km. Review the track width.',
    'pt-BR': 'GPS importado: {raw} pontos → {kept} de controle, {km} km. Revise a largura da pista.',
  },
  'app.statusGpsFailed': {
    en: 'The GPS file could not be imported.',
    'pt-BR': 'Não foi possível importar o GPS.',
  },
  'app.statusExampleRestored': { en: 'Example restored.', 'pt-BR': 'Exemplo restaurado.' },
})
