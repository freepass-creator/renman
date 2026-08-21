$ErrorActionPreference='Stop'
function GwsJson([string[]]$parts,[hashtable]$params){$j=$params|ConvertTo-Json -Compress -Depth 8;$raw=& gws @parts --params $j --format json 2>$null;if($LASTEXITCODE-ne0){throw 'gws failed'};($raw-join"`n")|ConvertFrom-Json -Depth 100}
function Get-Children([string]$folder){
 $all=@();$token=$null
 do{
  $p=@{q="'$folder' in parents and trashed = false";pageSize=1000;fields='files(id,name,mimeType,size,createdTime,modifiedTime,parents,md5Checksum),nextPageToken';corpora='drive';driveId='0ALp5cUm1kqTvUk9PVA';includeItemsFromAllDrives=$true;supportsAllDrives=$true}
  if($token){$p.pageToken=$token};$r=GwsJson @('drive','files','list') $p;$all+=@($r.files);$token=$r.nextPageToken
 }while($token)
 $all
}
function Get-Set($vr){$s=[System.Collections.Generic.HashSet[string]]::new();foreach($row in@($vr.values)){if($row.Count){$v=([string]$row[0]).Trim();if($v){[void]$s.Add($v)}}};$s}
function Mask([string]$v){if($v.Length-ge4){'****'+$v.Substring($v.Length-4)}else{'****'}}
$root='1bVlSlDmSIUyAylEsFfFvzRew6_HG9H-p'
$queue=[System.Collections.Generic.Queue[string]]::new();$queue.Enqueue($root);$files=@();$folders=0
while($queue.Count){$id=$queue.Dequeue();foreach($x in Get-Children $id){if($x.mimeType-eq'application/vnd.google-apps.folder'){$folders++;$queue.Enqueue($x.id)}else{$files+=$x}}}
$plateRx='(?<![0-9가-힣])([0-9]{2,3}[가-힣][0-9]{4})(?![0-9가-힣])'
$plateFiles=@{};$unmatched=@()
foreach($f in$file){$m=[regex]::Matches($f.name,$plateRx);if($m.Count-eq0){$unmatched+=$f}else{foreach($z in$m){$p=$z.Groups[1].Value;if(-not$plateFiles.ContainsKey($p)){$plateFiles[$p]=@()};$plateFiles[$p]+=$f}}}
$sheet=GwsJson @('sheets','spreadsheets','values','batchGet') @{spreadsheetId='1KEKm4j0oQ39Jk-0IgaydeMF_IpW7-_evOfeP_pyBkgM';ranges=@('자산!A3:A402','계약!D3:D464','보유 종료!A3:A170','계약서!A3:A1169');valueRenderOption='FORMATTED_VALUE'}
$asset=Get-Set $sheet.valueRanges[0];$contract=Get-Set $sheet.valueRanges[1];$ended=Get-Set $sheet.valueRanges[2];$index=Get-Set $sheet.valueRanges[3]
function Missing($set){@($set|Where-Object{-not$plateFiles.ContainsKey($_)})}
$hashGroups=@($files|Where-Object{$_.md5Checksum}|Group-Object md5Checksum|Where-Object Count -gt1)
$nameGroups=@($files|Group-Object name|Where-Object Count -gt1)
$latest=($files|Sort-Object createdTime -Descending|Select-Object -First 1).createdTime
$out=[ordered]@{
 checkedAt=(Get-Date -Format "yyyy-MM-dd HH:mm:ss 'KST'");folderId=$root;subfolders=$folders;files=$files.Count;uniqueHashes=@($files.md5Checksum|Where-Object{$_}|Sort-Object -Unique).Count;
 duplicateHashGroups=$hashGroups.Count;filesInDuplicateHashGroups=(($hashGroups|ForEach-Object{$_.Count}|Measure-Object -Sum).Sum);duplicateNameGroups=$nameGroups.Count;
 latestCreatedTime=$latest;plateMatchedFiles=($files.Count-$unmatched.Count);unmatchedFilenameFiles=$unmatched.Count;uniquePlateKeys=$plateFiles.Keys.Count;
 sourceCounts=@{asset=$asset.Count;contract=$contract.Count;ended=$ended.Count;index=$index.Count};
 matched=@{asset=@($asset|Where-Object{$plateFiles.ContainsKey($_)}).Count;contract=@($contract|Where-Object{$plateFiles.ContainsKey($_)}).Count;ended=@($ended|Where-Object{$plateFiles.ContainsKey($_)}).Count};
 missing=@{asset=(Missing $asset).Count;contract=(Missing $contract).Count;ended=(Missing $ended).Count};
 missingMasked=@{asset=@(Missing $asset|ForEach-Object{Mask $_});contract=@(Missing $contract|ForEach-Object{Mask $_});ended=@(Missing $ended|ForEach-Object{Mask $_})}
}
$out|ConvertTo-Json -Depth 10
