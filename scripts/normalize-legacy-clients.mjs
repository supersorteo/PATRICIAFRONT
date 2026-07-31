import fs from 'node:fs';
import path from 'node:path';

function printUsage() {
  console.log(`
Uso:
  npm run migrate:clients -- <archivo-entrada.json> [archivo-salida.json]

Ejemplo:
  npm run migrate:clients -- .\\data\\clientes-viejos.json .\\data\\clientes-base.import.json
`);
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return null;
  }
  return text;
}

function normalizeDigits(value) {
  const text = toText(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  return digits || null;
}

function normalizeName(value) {
  const text = toText(value);
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim();
}

function buildIdentityKey(rawClient) {
  const dni = normalizeDigits(rawClient?.dni);
  if (dni) return `dni:${dni}`;

  const phoneIntl = normalizeDigits(rawClient?.phoneIntl);
  if (phoneIntl) return `phone:${phoneIntl}`;

  const phoneRaw = normalizeDigits(rawClient?.phoneRaw);
  if (phoneRaw) return `phone:${phoneRaw}`;

  const name = normalizeName(rawClient?.name);
  if (name) return `name:${name.toLowerCase()}`;

  return null;
}

function getScore(rawClient) {
  let score = 0;
  if (normalizeName(rawClient?.name)) score += 5;
  if (normalizeDigits(rawClient?.dni)) score += 5;
  if (normalizeDigits(rawClient?.phoneIntl)) score += 4;
  if (normalizeDigits(rawClient?.phoneRaw)) score += 3;
  if (Array.isArray(rawClient?.clientVehicles) && rawClient.clientVehicles.length > 0) score += 1;
  if (toText(rawClient?.vehicle)) score += 1;
  if (toText(rawClient?.plate)) score += 1;
  if (toText(rawClient?.code)) score += 1;
  return score;
}

function chooseBetterValue(currentValue, candidateValue) {
  if (!currentValue && candidateValue) return candidateValue;
  return currentValue;
}

function mergeClients(current, candidate) {
  return {
    sourceIds: [...current.sourceIds, candidate.id].filter(value => value !== null && value !== undefined),
    sourceCount: current.sourceCount + 1,
    name: chooseBetterValue(current.name, normalizeName(candidate.name)),
    dni: chooseBetterValue(current.dni, normalizeDigits(candidate.dni)),
    phoneIntl: chooseBetterValue(current.phoneIntl, normalizeDigits(candidate.phoneIntl)),
    phoneRaw: chooseBetterValue(current.phoneRaw, normalizeDigits(candidate.phoneRaw)),
    bestScore: Math.max(current.bestScore, getScore(candidate)),
  };
}

function buildImportClient(mergedClient) {
  return {
    name: mergedClient.name,
    dni: mergedClient.dni,
    phoneIntl: mergedClient.phoneIntl,
    phoneRaw: mergedClient.phoneRaw,
    clientVehicles: [],
  };
}

function main() {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg) {
    printUsage();
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : path.resolve(process.cwd(), `${path.basename(inputPath, path.extname(inputPath))}.import.json`);
  const reportPath = outputPath.replace(/\.json$/i, '.report.json');

  if (!fs.existsSync(inputPath)) {
    console.error(`No existe el archivo de entrada: ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('El archivo de entrada debe contener un array JSON de clientes.');
    process.exit(1);
  }

  const byIdentity = new Map();
  const skipped = [];

  for (const item of raw) {
    const key = buildIdentityKey(item);
    if (!key) {
      skipped.push({
        id: item?.id ?? null,
        reason: 'sin-identidad',
        name: toText(item?.name),
        dni: toText(item?.dni),
        phoneIntl: toText(item?.phoneIntl),
        phoneRaw: toText(item?.phoneRaw),
      });
      continue;
    }

    const normalized = {
      sourceIds: item?.id !== null && item?.id !== undefined ? [item.id] : [],
      sourceCount: 1,
      name: normalizeName(item?.name),
      dni: normalizeDigits(item?.dni),
      phoneIntl: normalizeDigits(item?.phoneIntl),
      phoneRaw: normalizeDigits(item?.phoneRaw),
      bestScore: getScore(item),
    };

    if (!normalized.name) {
      skipped.push({
        id: item?.id ?? null,
        reason: 'sin-nombre',
        identityKey: key,
        dni: normalized.dni,
        phoneIntl: normalized.phoneIntl,
        phoneRaw: normalized.phoneRaw,
      });
      continue;
    }

    if (!byIdentity.has(key)) {
      byIdentity.set(key, normalized);
      continue;
    }

    const current = byIdentity.get(key);
    byIdentity.set(key, mergeClients(current, item));
  }

  const importClients = [];
  const duplicates = [];

  for (const [identityKey, mergedClient] of byIdentity.entries()) {
    importClients.push(buildImportClient(mergedClient));

    if (mergedClient.sourceCount > 1) {
      duplicates.push({
        identityKey,
        sourceIds: mergedClient.sourceIds,
        sourceCount: mergedClient.sourceCount,
        resolvedClient: buildImportClient(mergedClient),
      });
    }
  }

  importClients.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const report = {
    generatedAt: new Date().toISOString(),
    inputFile: inputPath,
    outputFile: outputPath,
    totals: {
      input: raw.length,
      imported: importClients.length,
      duplicatesCollapsed: duplicates.reduce((total, item) => total + (item.sourceCount - 1), 0),
      skipped: skipped.length,
    },
    rules: [
      'Solo se exportan name, dni, phoneIntl, phoneRaw y clientVehicles vacío.',
      'No se exportan campos operativos como paymentMethod, clover, vehicle, plate, notes, price, category, spaceKey, code, entryTimestamp, exitTimestamp y lastDayClosed.',
      'La deduplicación usa dni, luego phoneIntl, luego phoneRaw y por último name.',
    ],
    duplicates,
    skipped,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(importClients, null, 2), 'utf8');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Clientes importables: ${importClients.length}`);
  console.log(`Duplicados colapsados: ${report.totals.duplicatesCollapsed}`);
  console.log(`Registros descartados: ${skipped.length}`);
  console.log(`Archivo generado: ${outputPath}`);
  console.log(`Reporte generado: ${reportPath}`);
}

main();
