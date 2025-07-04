import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export function loadYaml(file: string, folder: string) {
  const content = fs.readFileSync(path.join(folder, file), 'utf8');
  return YAML.parse(content);
}
