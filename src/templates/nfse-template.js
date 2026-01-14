export const createNfseDefinition = (data) => {
  const v = (x, fallback = '-') => (x === undefined || x === null || x === '' ? fallback : x);

  const money = (n) => {
    if (n === undefined || n === null || n === '' || n === '-') return '-';
    const num = typeof n === 'number' ? n : Number(String(n).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(num)) return `R$ ${n}`;
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDocument = (doc) => {
    if (!doc) return '-';
    const clean = String(doc).replace(/\D/g, '');
    if (clean.length === 11) {
      return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (clean.length === 14) {
      return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return doc;
  };

  const chave = v(data.chaveAcesso);

  const headerColumns = [];
  
  headerColumns.push({
    width: '*',
    stack: [
      { text: 'Documento Auxiliar da NFS-e', style: 'title' },
      { text: 'NFS-e SEM VALIDADE JURÍDICA', style: 'pill' },
      { text: v(data.municipio, 'Município do Rio de Janeiro'), style: 'smallMuted' },
      { text: v(data.orgao, 'SMF / Receita Rio'), style: 'smallMuted' }
    ]
  });

  if (data.logo) {
    headerColumns.push({
      image: data.logo,
      width: 64,
      alignment: 'right',
      margin: [12, 0, 0, 0]
    });
  }

  let qrCodeElement;
  if (data.qrCodeImage) {
    qrCodeElement = {
      image: data.qrCodeImage,
      width: 40,
      height: 40,
      absolutePosition: { x: 490, y: 58 }
    };
  } else {
    qrCodeElement = {
      qr: chave,
      fit: 50,
      absolutePosition: { x: 490, y: 65 }
    };
  }

  return {
    pageMargins: [32, 20, 32, 20],
    content: [
      {
        columns: headerColumns,
        margin: [0, 0, 0, 8]
      },
      {
        style: 'block',
        stack: [
          { text: 'Chave de Acesso da NFS-e', style: 'label' },
          { text: chave, style: 'monoKey' },
          {
            text: 'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e.',
            style: 'smallMuted',
            margin: [0, 4, 80, 0]
          }
        ],
        margin: [0, 0, 0, 8]
      },
      qrCodeElement,
      {
        style: 'block',
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              { stack: [{ text: 'Número da NFS-e', style: 'label' }, { text: v(data.nNFSe), style: 'value' }] },
              { stack: [{ text: 'Competência da NFS-e', style: 'label' }, { text: v(data.competencia || data.dCompet), style: 'value' }] },
              { stack: [{ text: 'Data e Hora da emissão da NFS-e', style: 'label' }, { text: v(data.dhProc), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'Número da DPS', style: 'label' }, { text: v(data.numDps || data.dpsNumero), style: 'value' }] },
              { stack: [{ text: 'Série da DPS', style: 'label' }, { text: v(data.serie || data.serieDps), style: 'value' }] },
              { stack: [{ text: 'Data e Hora da emissão da DPS', style: 'label' }, { text: v(data.dpsEmissao || data.dhProc), style: 'value' }] }
            ]
          ]
        },
        layout: {
          hLineWidth: (i) => (i === 0 || i === 1 || i === 2 ? 0.6 : 0),
          vLineWidth: () => 0.6,
          hLineColor: () => '#d6d6d6',
          vLineColor: () => '#d6d6d6',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 3
        },
        margin: [0, 0, 0, 8]
      },
      { text: 'EMITENTE DA NFS-e', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*'],
          body: [
            [
              { stack: [{ text: 'Prestador do Serviço', style: 'label' }, { text: v(data.emit?.xNome), style: 'valueBold' }] },
              { stack: [{ text: 'CNPJ / CPF / NIF', style: 'label' }, { text: formatDocument(v(data.emit?.CNPJ || data.emit?.CPF)), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'Inscrição Municipal', style: 'label' }, { text: v(data.emit?.IM), style: 'value' }] },
              { stack: [{ text: 'Telefone', style: 'label' }, { text: v(data.emit?.fone), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'E-mail', style: 'label' }, { text: v(data.emit?.email), style: 'value' }] },
              { stack: [{ text: 'CEP', style: 'label' }, { text: v(data.emit?.enderNac?.CEP), style: 'value' }] }
            ],
            [
              {
                colSpan: 2,
                stack: [
                  { text: 'Endereço', style: 'label' },
                  {
                    text: v(
                      data.emit?.enderNac
                        ? `${v(data.emit.enderNac.xLgr)}${data.emit.enderNac.nro ? `, ${data.emit.enderNac.nro}` : ''}${data.emit.enderNac.xBairro ? `, ${data.emit.enderNac.xBairro}` : ''}`
                        : data.emit?.ender,
                      '-'
                    ),
                    style: 'value',
                    margin: [0, 0, 0, 2]
                  },
                  {
                    text: v(
                      data.emit?.enderNac
                        ? `${v(data.emit.enderNac.xMun)} - ${v(data.emit.enderNac.UF)}`
                        : data.emit?.municipio,
                      '-'
                    ),
                    style: 'smallMuted',
                    margin: [0, 1, 0, 0]
                  }
                ]
              },
              {}
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'TOMADOR DO SERVIÇO', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*'],
          body: [
            [
              { stack: [{ text: 'Nome / Nome Empresarial', style: 'label' }, { text: v(data.toma?.xNome), style: 'valueBold' }] },
              { stack: [{ text: 'CNPJ / CPF / NIF', style: 'label' }, { text: formatDocument(v(data.toma?.cpfCnpj)), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'Inscrição Municipal', style: 'label' }, { text: v(data.toma?.IM), style: 'value' }] },
              { stack: [{ text: 'Telefone', style: 'label' }, { text: v(data.toma?.fone), style: 'value' }] }
            ],
            [
              {
                colSpan: 2,
                stack: [
                  { text: 'Endereço', style: 'label' },
                  { text: v(data.toma?.ender), style: 'value' },
                  { text: v(data.toma?.municipio), style: 'smallMuted', margin: [0, 1, 0, 0] }
                ]
              },
              {}
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'INTERMEDIÁRIO DO SERVIÇO', style: 'sectionHeader' },
      {
        text: v(data.intermediario, 'NÃO IDENTIFICADO NA NFS-e'),
        style: 'value',
        margin: [0, 4, 0, 8]
      },
      { text: 'SERVIÇO PRESTADO', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*'],
          body: [
            [
              { stack: [{ text: 'Código de Tributação Nacional', style: 'label' }, { text: v(data.serv?.xTribNac || data.serv?.cTribNac), style: 'value' }] },
              { stack: [{ text: 'Código de Tributação Municipal', style: 'label' }, { text: v(data.serv?.xTribMun || data.serv?.cTribMun), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'Local da Prestação', style: 'label' }, { text: v(data.locPrestacao), style: 'value' }] },
              { stack: [{ text: 'País da Prestação', style: 'label' }, { text: v(data.paisPrestacao), style: 'value' }] }
            ],
            [
              {
                colSpan: 2,
                stack: [
                  { text: 'Descrição do Serviço', style: 'label' },
                  { text: v(data.serv?.xDescServ), style: 'value' },
                  { text: `NBS: ${v(data.serv?.cNBS)}`, style: 'smallMuted', margin: [0, 2, 0, 0] }
                ]
              },
              {}
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'TRIBUTAÇÃO MUNICIPAL', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              { stack: [{ text: 'Tributação do ISSQN', style: 'label' }, { text: v(data.iss?.tributacao), style: 'value' }] },
              { stack: [{ text: 'Município de Incidência do ISSQN', style: 'label' }, { text: v(data.iss?.munIncidencia), style: 'value' }] },
              { stack: [{ text: 'Retenção do ISSQN', style: 'label' }, { text: v(data.iss?.retencao), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'Valor do Serviço', style: 'label' }, { text: money(data.valores?.vServ), style: 'valueBold' }] },
              { stack: [{ text: 'BC ISSQN', style: 'label' }, { text: money(data.valores?.vBC), style: 'value' }] },
              { stack: [{ text: 'Alíquota Aplicada', style: 'label' }, { text: v(data.valores?.aliq ? `${data.valores.aliq}%` : '-'), style: 'value' }] }
            ],
            [
              { stack: [{ text: 'ISSQN Apurado', style: 'label' }, { text: money(data.valores?.vISS), style: 'value' }] },
              { stack: [{ text: 'Desconto Incondicionado', style: 'label' }, { text: money(data.valores?.descIncond || data.valores?.vDescIncond), style: 'value' }] },
              { stack: [{ text: 'Total Deduções/Reduções', style: 'label' }, { text: money(data.valores?.deducoes), style: 'value' }] }
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'TRIBUTAÇÃO FEDERAL', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*', '*', '*', '*'],
          body: [
            [
              { text: 'IRRF', style: 'tableHeader' },
              { text: 'CP', style: 'tableHeader' },
              { text: 'CSLL', style: 'tableHeader' },
              { text: 'PIS', style: 'tableHeader' },
              { text: 'COFINS', style: 'tableHeader' }
            ],
            [
              money(data.federal?.IRRF),
              money(data.federal?.CP),
              money(data.federal?.CSLL),
              money(data.federal?.PIS),
              money(data.federal?.COFINS)
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'VALOR TOTAL DA NFS-E', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              { stack: [{ text: 'Valor do Serviço', style: 'label' }, { text: money(data.valores?.vServ), style: 'valueBold' }] },
              { stack: [{ text: 'IRRF, CP, CSLL - Retidos', style: 'label' }, { text: money(data.totalFederalRetido || 0), style: 'value' }] },
              { stack: [{ text: 'Valor Líquido da NFS-e', style: 'label' }, { text: money(data.valores?.vLiq || data.valores?.vServ), style: 'valueBold' }] }
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'TOTAIS APROXIMADOS DOS TRIBUTOS', style: 'sectionHeader' },
      {
        style: 'block',
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              { stack: [{ text: 'Federais', style: 'label' }, { text: money(data.totaisTributos?.federais), style: 'value' }] },
              { stack: [{ text: 'Estaduais', style: 'label' }, { text: money(data.totaisTributos?.estaduais), style: 'value' }] },
              { stack: [{ text: 'Municipais', style: 'label' }, { text: money(data.totaisTributos?.municipais), style: 'value' }] }
            ]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8]
      },
      { text: 'INFORMAÇÕES COMPLEMENTARES', style: 'sectionHeader' },
      { text: `NBS: ${v(data.serv?.cNBS)}`, style: 'value', margin: [0, 4, 0, 0] }
    ],

    styles: {
      title: { fontSize: 12, bold: true },
      pill: {
        fontSize: 8,
        bold: true,
        color: '#FF0000',
        margin: [0, 4, 0, 4]
      },
      sectionHeader: {
        fontSize: 9,
        bold: true,
        fillColor: '#eeeeee',
        margin: [0, 4, 0, 2],
        color: '#000000'
      },
      label: { fontSize: 7, color: '#555555', margin: [0, 0, 0, 3] },
      value: { fontSize: 8, color: '#000000' },
      valueBold: { fontSize: 8, bold: true, color: '#000000' },
      smallMuted: { fontSize: 7, color: '#666666', margin: [0, 0, 0, 3] },
      monoKey: { fontSize: 8, bold: true, characterSpacing: 0.2 },
      tableHeader: { bold: true, fontSize: 8, color: '#000000' },
      block: { margin: [0, 0, 0, 0] }
    },

    defaultStyle: {
      fontSize: 8
    }
  };
};
