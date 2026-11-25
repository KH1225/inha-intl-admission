# 계정 관리 서버 함수 (manage-account)

현황판 → 계정 관리에서 **계정 만들기**, **비밀번호 변경**, **계정 삭제**를 처리합니다.
계정 삭제는 본인 계정이 아니고, 그 계정으로 남긴 면접 평가·학점인정 기록이 없을 때만 됩니다. (기록이 있으면 사용 중지를 안내)
사용 중인 총괄관리자만 쓸 수 있고, 비밀번호는 어디에도 기록하지 않습니다.

## 배포
Supabase → Edge Functions → Deploy a new function → Via Editor
- 함수 이름: `manage-account` (정확히)
- 이 폴더의 `index.ts`를 붙여 넣고 Deploy
- **Verify JWT는 켠 그대로** 둡니다 (staff-login과 다름)
- Secrets 추가 필요 없음
