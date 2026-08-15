import fs from 'node:fs';

const source = JSON.parse(fs.readFileSync('C:/dev/freepasserp4/public/data/vehicle-master.json', 'utf8'));
const entries = source.entries || [];

const headers = [
  '관리상태', '트림행키', '마스터ID', '파워트레인순번', '트림순번',
  '제조사', '모델', '세부모델', '세대명', '개발코드', '생산시작', '생산종료', '연식시작', '연식종료', '원산지',
  '파워트레인', '연료', '정확배기량(cc)', '표시배기량(L)', '터보', '구동방식', '인승', '배터리(kWh)',
  '세부트림', '트림별칭', '근거URL', '근거메모', '최종확인일', '검증상태',
];

const rows = [];
for (const entry of entries) {
  const variants = entry.variants?.length ? entry.variants : [null];
  variants.forEach((variant, variantIndex) => {
    const trims = variant?.trims?.length ? variant.trims : [''];
    trims.forEach((trim, trimIndex) => {
      rows.push([
        '보강대기', `${entry.id}::v${String(variantIndex + 1).padStart(2, '0')}::t${String(trimIndex + 1).padStart(2, '0')}`,
        entry.id, variantIndex + 1, trimIndex + 1,
        entry.maker || '', entry.model || '', entry.sub_model || '', entry.generation_name || '', entry.gen_code || '',
        entry.production_start || '', entry.production_end || '', entry.year_start || '', entry.year_end || '', entry.origin || '',
        variant?.label || '', variant?.fuel || '', variant?.engine_cc ?? '', variant?.displacement_l ?? '',
        variant ? (variant.turbo ? '예' : '아니오') : '', variant?.drivetrain || '', variant?.seat ?? '', variant?.battery_kwh ?? '',
        trim || '', Array.isArray(variant?.aliases) ? variant.aliases.join(' | ') : '', '', '', '', '미검증',
      ]);
    });
  });
}

const offset = Math.max(0, Number(process.argv[2] || 0));
const limit = Math.max(1, Number(process.argv[3] || rows.length));
process.stdout.write(JSON.stringify({ headers, total: rows.length, offset, rows: rows.slice(offset, offset + limit) }));
