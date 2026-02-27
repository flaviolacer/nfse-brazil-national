import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.join(__dirname, 'src', 'templates', 'xsd', '1.01', 'tiposSimples_v1.01.xsd');

async function main() {
    try {
        console.log(`Lendo arquivo: ${targetFile}`);
        let data = await fs.readFile(targetFile, 'utf8');
        let modified = false;

        // 1. Substituir \d por [0-9] para compatibilidade com libxml2/xmllint
        // O xmllint (usado no macOS/Linux) não suporta o atalho \d em XSD regex, exigindo [0-9]
        if (data.includes('\\d')) {
            // Substitui todas as ocorrências globais de \d por [0-9]
            data = data.replace(/\\d/g, '[0-9]');
            console.log('✅ Todas as ocorrências de \\d substituídas por [0-9].');
            modified = true;
        }

        // 2. Remover âncoras ^ e $ (XSD 1.0 trata como literais, não como início/fim de string)
        if (data.includes('^') || data.includes('$')) {
             // Remove ^ logo após as aspas de abertura
             data = data.replace(/value="\^/g, 'value="');
             
             // Remove $ logo antes das aspas de fechamento
             data = data.replace(/\$"/g, '"');
             
             console.log('✅ Âncoras ^ e $ removidas (incompatíveis com XSD 1.0/libxml2).');
             modified = true;
        }

        if (modified) {
            await fs.writeFile(targetFile, data, 'utf8');
            console.log('💾 Arquivo XSD salvo com sucesso.');
        } else {
            console.log('⚠️ Nenhuma alteração necessária (o arquivo já pode estar atualizado).');
        }
    } catch (err) {
        console.error('❌ Erro:', err.message);
    }
}

main();