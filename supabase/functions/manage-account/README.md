# 계정 관리 서버 함수 (manage-account)

현황판 → 계정 관리에서 **계정 만들기**와 **비밀번호 변경**을 처리합니다.
사용 중인 총괄관리자만 쓸 수 있고, 비밀번호는 어디에도 기록하지 않습니다.

## 배포
Supabase → Edge Functions → Deploy a new function → Via Editor
- 함수 이름: `manage-account` (정확히)
- 이 폴더의 `index.ts`를 붙여 넣고 Deploy
- **Verify JWT는 켠 그대로** 둡니다 (staff-login과 다름)
- Secrets 추가 필요 없음
