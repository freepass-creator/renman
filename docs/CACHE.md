# 빌드 캐시 · 백업 (SSOT)

## 결론 (Next/Turbopack)

`.next` 는 **프로젝트 안에** 둔다.  
밖으로 빼거나(`distDir`·정션) 실제 경로가 프로젝트 밖이면 Turbopack이 `node_modules`(tailwind 등)를 못 찾아 **500** 난다.

백업을 가볍게 하려면 **캐시를 옮기지 말고, 복사할 때 빼면 된다.**

## 권장 레이아웃

| 경로 | 역할 |
|---|---|
| `C:\dev\jpkerp6-app\` | **일상 작업** |
| `C:\dev\jpkerp6-app\.next\` | 빌드 캐시 (로컬, gitignore) |
| `C:\dev\jpkerp6-app\node_modules\` | 패키지 (gitignore) |
| OneDrive `…\jpkerp6-app\` | 백업 보관 (원본 유지·복사본) |

`C:\dev\cache\` 는 예전에 쓰던 자리. **지금은 쓰지 않음** (남아 있어도 무시·삭제 OK).

## 백업 (이것만 지키면 용량 문제 없음)

```powershell
robocopy "C:\dev\jpkerp6-app" "<백업경로>\jpkerp6-app" /E /XD node_modules .next .git
```

**포함:** 소스 · `docs` · `package-lock.json` · 설정  
**제외:** `.next` · `node_modules` · `.git`(선택) · `.env.local`

복원 후:
```powershell
cd C:\dev\jpkerp6-app
npm install
npm run dev   # http://localhost:6006
```

## 작업 vs 백업

- 작업: `C:\dev\jpkerp6-app` 만 연다.
- OneDrive 쪽은 보관용. 반영 시 위 `robocopy` (캐시 제외).
