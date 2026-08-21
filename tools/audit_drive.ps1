$ErrorActionPreference='Stop'
function GwsJson([string[]]$parts,[hashtable]$params){$j=$params|ConvertTo-Json -Compress -Depth 8;$raw=& gws @parts --params $j --format json 2>$null;if($LASTEXITCODE-ne 0){throw 'gws failed'};($raw-join"`n")|ConvertFrom-Json -Depth 50}
$folders=[ordered]@{
 sw_B1='1a3xPSiJO8lRlKHivyvRnIzxPx4Lu5hjp';sw_B2='1zr2Lia7lwH3v1Ijx1GNoaTYPvasmSfFA';
 pr_B1='1yo-QG-NtYo3W8pDs1VVpxc4Qa0MICcwZ';pr_B2='1e0Xuwb266bSWQNW9wi4MHgTt1PNVXwLE';pr_B3_current='1y5y9g2Q8D9_Q-NIWFh9BfwG2Yz_ZqVTE';
 sw_inbox='1eAPhChdjYOpAPAKqjemh88IA2wg3BRlv';pr_inbox='1aK-IsVEMIPEopXLucgZOc-Hov9ymTQKM';calls='10K8uSl6BAosmAGsaomy_kAFTrlR_KMjz'
}
$out=[ordered]@{}
foreach($name in $folders.Keys){
 $id=$folders[$name];$r=GwsJson @('drive','files','list') @{q="'$id' in parents and trashed = false";pageSize=1000;fields='files(id,name,size,mimeType,modifiedTime,parents,md5Checksum)';corpora='drive';driveId='0ALp5cUm1kqTvUk9PVA';includeItemsFromAllDrives=$true;supportsAllDrives=$true}
 $files=@($r.files);$physical=@($files|Where-Object{$_.mimeType-ne'application/vnd.google-apps.folder'});$groups=@($physical|Group-Object {"$($_.name)|$($_.size)"}|Where-Object Count -gt 1)
 $hashGroups=@($physical|Where-Object{$_.md5Checksum}|Group-Object md5Checksum|Where-Object Count -gt 1)
 $out[$name]=[ordered]@{items=$files.Count;files=$physical.Count;folders=@($files|Where-Object{$_.mimeType-eq'application/vnd.google-apps.folder'}).Count;duplicateNameSizeGroups=$groups.Count;duplicateFilesInGroups=(($groups|ForEach-Object{$_.Count}|Measure-Object -Sum).Sum);duplicateHashGroups=$hashGroups.Count;duplicateHashFiles=(($hashGroups|ForEach-Object{$_.Count}|Measure-Object -Sum).Sum)}
}
$out|ConvertTo-Json -Depth 10
