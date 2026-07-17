#!/usr/bin/env node
//
// Copyright (c) 2026 IndustryFusion Europe UG
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Regenerates openapi.yaml and openapi.company.yaml from a running app's
// Swagger metadata. Run `npm run start:dev` (or any other way of getting
// the app listening) first, then `npm run generate:openapi`.

const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const port = process.env.PORT || 4007;
const url = `http://localhost:${port}/api-docs-json`;

// Walks every $ref in the given value and adds the referenced schema name
// to `found`, recursing into that schema so transitively-referenced schemas
// are included too.
function collectSchemaRefs(value, schemas, found) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaRefs(item, schemas, found);
    return;
  }
  if (value && typeof value === 'object') {
    if (typeof value.$ref === 'string') {
      const match = value.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match && !found.has(match[1])) {
        found.add(match[1]);
        collectSchemaRefs(schemas[match[1]], schemas, found);
      }
    }
    for (const key of Object.keys(value)) {
      collectSchemaRefs(value[key], schemas, found);
    }
  }
}

function buildCompanyScopedDoc(doc) {
  const paths = Object.fromEntries(
    Object.entries(doc.paths).filter(([p]) => p.startsWith('/company/') || p === '/company'),
  );

  const allSchemas = (doc.components && doc.components.schemas) || {};
  const usedSchemas = new Set();
  collectSchemaRefs(paths, allSchemas, usedSchemas);
  const schemas = Object.fromEntries(
    Object.entries(allSchemas).filter(([name]) => usedSchemas.has(name)),
  );

  return {
    ...doc,
    info: {
      ...doc.info,
      title: `${doc.info.title} - Company API`,
      description:
        'Scoped to just the /company/* endpoints (CompanyController): company ' +
        'CRUD, access groups, physical assets (CompanyAsset/GateWay/Server), ' +
        'and factory-keyed lookups. See openapi.yaml for the full API surface.',
    },
    paths,
    components: { ...doc.components, schemas },
  };
}

http
  .get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`GET ${url} returned ${res.statusCode}`);
        process.exit(1);
      }

      const doc = JSON.parse(data);
      const root = path.join(__dirname, '..');

      fs.writeFileSync(
        path.join(root, 'openapi.yaml'),
        yaml.dump(doc, { noRefs: true, lineWidth: -1 }),
      );

      fs.writeFileSync(
        path.join(root, 'openapi.company.yaml'),
        yaml.dump(buildCompanyScopedDoc(doc), { noRefs: true, lineWidth: -1 }),
      );

      console.log('Wrote openapi.yaml and openapi.company.yaml');
    });
  })
  .on('error', (err) => {
    console.error(`Failed to reach ${url} — is the app running? (npm run start:dev)`);
    console.error(err.message);
    process.exit(1);
  });
