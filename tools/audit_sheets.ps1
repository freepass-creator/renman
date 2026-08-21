$ErrorActionPreference = 'Stop'

$books = @{
  switch = @{
    id = '1KEKm4j0oQ39Jk-0IgaydeMF_IpW7-_evOfeP_pyBkgM'
    sheets = @(
      @('시작',71,8),@('운영관리',6,6),@('직원 안내',54,3),@('요약',56,14),@('운영현황',260,16),
      @('자산',402,78),@('계약',464,111),@('수납',308,237),@('계약종료 미수',233,192),@('보유 종료',170,20),
      @('고객(기준)',1011,53),@('계약서',1169,9),@('면책금',1200,43),@('시세',165,15),@('반납',1046,310),
      @('대여료 인하 관리',1200,140),@('조치',6,6),@('해야할일',2000,14),@('확인요청',45,9),@('백데이터',6,6),@('마스터목록',1819,12)
    )
    keys = @{
      asset='자산!A3:A402'; contract='계약!D3:D464'; receipt='수납!J3:J308'; customer='고객(기준)!E2:E1011'; docs='계약서!A3:A1169'; ended='보유 종료!A3:A170'
    }
  }
  prime = @{
    id = '13QQTz1W0FlBk5V8lggVw93EhDwIgjFF4mRb2BOiKSPk'
    sheets = @(
      @('시작',46,8),@('직원 안내',54,3),@('운영관리',6,6),@('요약',57,14),@('운영현황',260,16),
      @('자산',402,78),@('계약',464,111),@('계약 분류',221,5),@('수납',308,237),@('계약종료 미수',233,192),
      @('보유 종료',170,20),@('고객',1000,52),@('계약서',217,9),@('보험',1000,53),@('보험료(분납)',1000,63),
      @('채권·회수',6,6),@('위약금(채권)',1083,726),@('회수필요명단',1000,58),@('회수(반납)매각명단',1189,158),
      @('반납회수 명단자 비용기록',1000,173),@('대여료',6,6),@('대여료(구독료)',1015,555),@('대여료(구독료) - 인수회수반납',1157,694),
      @('조치',6,6),@('해야할일',2000,14),@('확인요청',60,9),@('백데이터',6,6),@('입금내역',1274,12),
      @('대여료(구독료) 기존데이터',1015,436),@('마스터목록',1819,12)
    )
    keys = @{
      asset='자산!A3:A402'; contract='계약!D3:D464'; receipt='수납!J3:J308'; customer='고객!B2:B1000'; docs='계약서!A3:A217'; ended='보유 종료!A3:A170'; deposits='입금내역!A3:L1274'
    }
  }
}

function Col-Letter([int]$n) {
  $s=''
  while ($n -gt 0) { $n--; $s = [char](65 + ($n % 26)) + $s; $n=[math]::Floor($n/26) }
  return $s
}

function Invoke-GwsJson([string[]]$parts, [hashtable]$params) {
  $json = $params | ConvertTo-Json -Compress -Depth 10
  $raw = & gws @parts --params $json --format json 2>$null
  if ($LASTEXITCODE -ne 0) { throw "gws failed: $($parts -join ' ')" }
  return ($raw -join "`n") | ConvertFrom-Json -Depth 100
}

function NonBlankSet($valueRange) {
  $set=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach($row in @($valueRange.values)) {
    if($row.Count -gt 0) { $v=[string]$row[0]; if(-not [string]::IsNullOrWhiteSpace($v)){[void]$set.Add($v.Trim())} }
  }
  return $set
}

function CountDuplicates($valueRange) {
  $h=@{}
  foreach($row in @($valueRange.values)) {
    if($row.Count -gt 0){$v=[string]$row[0]; if(-not [string]::IsNullOrWhiteSpace($v)){$v=$v.Trim();$h[$v]=1+($h[$v]??0)}}
  }
  return @($h.GetEnumerator() | Where-Object Value -gt 1).Count
}

$result=[ordered]@{auditedAt=(Get-Date -Format "yyyy-MM-dd HH:mm:ss 'KST'"); books=@{}}

foreach($bookName in @('switch','prime')) {
  $b=$books[$bookName]
  $ranges=@()
  foreach($s in $b.sheets){$ranges += "'$($s[0].Replace("'","''"))'!A1:$(Col-Letter $s[2])$($s[1])"}
  $formatted=Invoke-GwsJson @('sheets','spreadsheets','values','batchGet') @{spreadsheetId=$b.id;ranges=$ranges;valueRenderOption='FORMATTED_VALUE'}
  $formula=Invoke-GwsJson @('sheets','spreadsheets','values','batchGet') @{spreadsheetId=$b.id;ranges=$ranges;valueRenderOption='FORMULA'}

  $errors=@{}
  $formulaCount=0
  for($i=0;$i -lt $formatted.valueRanges.Count;$i++){
    $tab=$b.sheets[$i][0]
    $tabErrors=@{'#REF!'=0;'#N/A'=0;'#VALUE!'=0;'#DIV/0!'=0;'#NAME?'=0;'#NUM!'=0;'#ERROR!'=0}
    foreach($row in @($formatted.valueRanges[$i].values)){
      foreach($v in @($row)){
        $sv=[string]$v
        if($tabErrors.ContainsKey($sv)){$tabErrors[$sv]++}
      }
    }
    foreach($row in @($formula.valueRanges[$i].values)){foreach($v in @($row)){if(([string]$v).StartsWith('=')){$formulaCount++}}}
    $sum=($tabErrors.Values|Measure-Object -Sum).Sum
    if($sum -gt 0){$errors[$tab]=[ordered]@{total=$sum;byType=$tabErrors}}
  }

  $keyRanges=@($b.keys.GetEnumerator()|ForEach-Object{$_.Value})
  $keyResp=Invoke-GwsJson @('sheets','spreadsheets','values','batchGet') @{spreadsheetId=$b.id;ranges=$keyRanges;valueRenderOption='FORMATTED_VALUE'}
  $keyData=@{}
  for($i=0;$i -lt $keyRanges.Count;$i++){$keyData[$keyRanges[$i]]=$keyResp.valueRanges[$i]}
  $sets=@{}
  foreach($k in $b.keys.Keys){if($k -ne 'deposits'){$sets[$k]=NonBlankSet $keyData[$b.keys[$k]]}}
  $diffs=[ordered]@{}
  foreach($pair in @(@('contract','asset'),@('asset','contract'),@('customer','asset'),@('asset','customer'),@('receipt','asset'),@('docs','asset'))){
    $a=$sets[$pair[0]];$c=0;foreach($v in $a){if(-not $sets[$pair[1]].Contains($v)){$c++}};$diffs["$($pair[0])_not_$($pair[1])"]=$c
  }
  $assetOrEnded=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach($v in $sets.asset){[void]$assetOrEnded.Add($v)}; foreach($v in $sets.ended){[void]$assetOrEnded.Add($v)}
  foreach($source in @('contract','customer','receipt','docs')){
    $c=0;foreach($v in $sets[$source]){if(-not $assetOrEnded.Contains($v)){$c++}};$diffs["${source}_not_asset_or_ended"]=$c
  }
  $counts=[ordered]@{}
  foreach($k in $sets.Keys){$counts[$k]=$sets[$k].Count}
  $dups=[ordered]@{}
  foreach($k in @('asset','contract','receipt','customer','docs')){$dups[$k]=CountDuplicates $keyData[$b.keys[$k]]}
  $depositRows=$null
  if($bookName -eq 'prime'){$depositRows=@($keyData[$b.keys.deposits].values|Where-Object{$_.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$_[0])}).Count}
  $file=Invoke-GwsJson @('drive','files','get') @{fileId=$b.id;fields='id,name,modifiedTime,version'}
  $result.books[$bookName]=[ordered]@{file=$file;sheetCount=$b.sheets.Count;formulaCount=$formulaCount;errors=$errors;errorTotal=(($errors.Values|ForEach-Object{$_.total}|Measure-Object -Sum).Sum);counts=$counts;duplicateKeyGroups=$dups;differences=$diffs;depositRows=$depositRows}
}

# 공용 운영 시트의 값·수식 오류와 직원창구 최소노출/상태값을 별도 감사한다.
$opsBooks=@{
  navigation=@{id='1EO72KmCWKeZIcSAL2WAsmHMm2ZKy5imDqjWwyud2FSg';sheets=@(@('업무 지침',100,8),@('요청한 것',202,11),@('할 것',207,11),@('스위치플랜 요청',200,10),@('프라임구독 요청',200,10))}
  map=@{id='1cur0CNa14hJh8Vvu0etKtKGIzWYUPKEs9M65WM_Uiv8';sheets=@(@('시트지도',122,7),@('직원 안내',53,3),@('법인 사이트',76,6),@('자료요청',47,9),@('업무 매뉴얼',80,4),@('AI 사용법',37,4),@('AI 인계',66,4),@('AI 작업기록',2000,17),@('통화처리',2000,22),@('일감현황',80,8),@('해야할일(전사)',1267,15),@('관제',1000,26),@('해지 대상',63,14),@('조치대상',1000,26),@('채권통합',1000,26))}
}
$result.ops=@{}
foreach($opName in @('navigation','map')){
  $b=$opsBooks[$opName];$ranges=@();foreach($s in $b.sheets){$ranges += "'$($s[0].Replace("'","''"))'!A1:$(Col-Letter $s[2])$($s[1])"}
  $fv=Invoke-GwsJson @('sheets','spreadsheets','values','batchGet') @{spreadsheetId=$b.id;ranges=$ranges;valueRenderOption='FORMATTED_VALUE'}
  $fm=Invoke-GwsJson @('sheets','spreadsheets','values','batchGet') @{spreadsheetId=$b.id;ranges=$ranges;valueRenderOption='FORMULA'}
  $err=@{};$fc=0
  for($i=0;$i -lt $fv.valueRanges.Count;$i++){
    $tab=$b.sheets[$i][0];$c=0
    foreach($row in @($fv.valueRanges[$i].values)){foreach($v in @($row)){if(([string]$v) -in @('#REF!','#N/A','#VALUE!','#DIV/0!','#NAME?','#NUM!','#ERROR!')){$c++}}}
    foreach($row in @($fm.valueRanges[$i].values)){foreach($v in @($row)){if(([string]$v).StartsWith('=')){$fc++}}}
    if($c -gt 0){$err[$tab]=$c}
  }
  $file=Invoke-GwsJson @('drive','files','get') @{fileId=$b.id;fields='id,name,modifiedTime,version'}
  $entry=[ordered]@{file=$file;sheetCount=$b.sheets.Count;formulaCount=$fc;errors=$err;errorTotal=(($err.Values|Measure-Object -Sum).Sum)}
  if($opName -eq 'navigation'){
    $staff=@{};$ji=@{};$invalid=@();$allowed=@('요청','진행','자료대기','지실장확인','완료','해당없음')
    foreach($tab in @('요청한 것','할 것')){
      $idx=(@($b.sheets|ForEach-Object{$($_[0])})).IndexOf($tab);$rows=@($fv.valueRanges[$idx].values)
      $staff[$tab]=@{스위치플랜=0;프라임구독=0};$ji[$tab]=@{스위치플랜=0;프라임구독=0}
      for($ri=4;$ri -lt $rows.Count;$ri++){
        $row=@($rows[$ri]);$corp=if($row.Count -gt 1){[string]$row[1]}else{''};$role=if($row.Count -gt 2){[string]$row[2]}else{''};$status=if($row.Count -gt 7){[string]$row[7]}else{''}
        if($corp -in @('스위치플랜','프라임구독')){if($role -eq '직원'){$staff[$tab][$corp]++}elseif($role -eq '지실장'){$ji[$tab][$corp]++};if($status -and $status -notin $allowed){$invalid += "${tab}:$($ri+1)"}}
      }
    }
    $entry.employeeRows=$staff;$entry.jisiljangRows=$ji;$entry.invalidStatusCount=$invalid.Count
  } else {
    $idx=(@($b.sheets|ForEach-Object{$($_[0])})).IndexOf('AI 작업기록');$rows=@($fv.valueRanges[$idx].values);$ids=@{};$pop=0;$dup=0
    for($ri=2;$ri -lt $rows.Count;$ri++){ $row=@($rows[$ri]);if($row.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$row[0])){$pop++;$id=[string]$row[0];if($ids.ContainsKey($id)){$dup++}else{$ids[$id]=1}} }
    $idx2=(@($b.sheets|ForEach-Object{$($_[0])})).IndexOf('통화처리');$callRows=@($fv.valueRanges[$idx2].values);$calls=0;for($ri=2;$ri -lt $callRows.Count;$ri++){if($callRows[$ri].Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$callRows[$ri][0])){$calls++}}
    $entry.auditLogRows=$pop;$entry.auditDuplicateIds=$dup;$entry.callQueueRows=$calls
  }
  $result.ops[$opName]=$entry
}

$result | ConvertTo-Json -Depth 20
