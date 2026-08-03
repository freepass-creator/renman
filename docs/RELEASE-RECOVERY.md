# RENMAN 운영 백업·복구 절차

## 원칙

- 운영 Firestore는 Google 관리형 내보내기로 백업한다. 고객 개인정보를 로컬 JSON 파일로 만들지 않는다.
- 대상 프로젝트는 `renman-dd0a2`로 고정한다.
- 운영 데이터베이스의 PITR와 삭제 보호가 모두 활성화된 경우에만 출시 사전검증을 통과시킨다.
- 백업은 배포 직전 실행하고 작업 완료 상태와 `gs://` 경로를 배포 기록에 남긴다.
- 복구는 같은 문서 ID를 덮어쓰지만 백업 이후 생성된 문서를 지우지 않는다. 완전한 시점 복원에는 Firestore PITR 또는 별도 정리 절차가 필요하다.

## 백업

1. `npm run backup:preflight` — Firestore·Storage 위치와 서비스 계정의 export/import/작업조회 권한을 읽기 전용으로 확인한다.
2. 출력된 프로젝트·버킷·컬렉션 범위를 확인한다.
3. PowerShell에서 `$env:FIRESTORE_BACKUP_CONFIRM='BACKUP:renman-dd0a2'`를 설정한다.
4. `npm run backup:run`
5. 출력된 장기 작업 ID가 완료됐는지 Google Cloud에서 확인하고 내보내기 경로를 기록한다.

`FIRESTORE_BACKUP_BUCKET`이 없으면 Firebase Storage 버킷을 사용한다. 버킷 위치와 Firestore 위치가 다르거나 서비스 계정/Firestore 서비스 에이전트의 Storage 권한이 부족하면 실행이 거부된다.

실행 서비스 계정에는 `Cloud Datastore Import Export Admin`(`roles/datastore.importExportAdmin`) 역할이 필요하다. 같은 프로젝트의 Storage 버킷은 Firestore 서비스 에이전트가 기본적으로 접근하지만, 별도 프로젝트 버킷이면 해당 서비스 에이전트에 버킷 권한도 부여해야 한다.

## 삭제 보호

- 상태 확인: `npm run firestore:delete-protection:check`
- 활성화는 프로젝트 소유자 권한으로 `gcloud firestore databases update --database='(default)' --project=renman-dd0a2 --delete-protection`을 실행한다.
- `npm run backup:preflight`는 삭제 보호가 `DELETE_PROTECTION_ENABLED`가 아니면 출시 차단으로 실패한다.
- 삭제 보호를 해제하려면 별도 운영 승인과 변경 기록이 필요하다.

## 복구

1. 백업 경로로 `npm run restore:preflight -- --input=gs://bucket/firestore-managed/...`를 실행한다.
2. 대상 프로젝트와 복구 범위를 승인한다.
3. PowerShell에서 `$env:FIRESTORE_RESTORE_CONFIRM='RESTORE:renman-dd0a2'`를 설정한다.
4. `npm run restore:run -- --input=gs://bucket/firestore-managed/...`를 실행한다.
5. 완료 후 미수 총액, 수납 합계, 자금일보, 계약 상태, `audit_logs`를 대사한다.

운영 장애 중에는 백업 경로를 추측하거나 가장 최근 폴더를 자동 선택하지 않는다. 반드시 완료가 확인된 정확한 경로만 사용한다.
