# 안내 메일 발송 설정

사이트의 **안내 메일 발송** 화면(면접 안내 / 합격자 등록 안내 / 등록금 입금 확인 / 오리엔테이션 안내)은
이 서버 함수(`send-interview-mail`)를 통해 메일을 보냅니다.

> 함수 코드를 고친 뒤에는 Supabase 편집기에 새 `index.ts` 를 다시 붙여 넣고 **Deploy** 해야 반영됩니다.

## 1. 발송 기록 테이블
Supabase → SQL Editor 에서 `sql/2026-11-11_메일발송기록.sql` 실행

## 2. 보내는 메일 계정 (Gmail 기준)
1. 국제교류팀 Gmail 계정 → Google 계정 관리 → 보안 → **2단계 인증** 켜기
2. 같은 화면의 **앱 비밀번호** → 이름 `supabase` → 생성된 16자리 비밀번호 복사

## 3. 서버 함수 만들기
Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**
- 함수 이름: `send-interview-mail`
- 이 폴더의 `index.ts` 내용을 통째로 붙여 넣고 **Deploy**

## 4. Secrets 등록
Supabase → Edge Functions → **Secrets** 에 추가

| 이름 | 값 (예) |
|---|---|
| `MAIL_FROM` | `인하공업전문대학 국제교류팀 <itc.intl@gmail.com>` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `itc.intl@gmail.com` |
| `SMTP_PASS` | 2단계에서 만든 16자리 앱 비밀번호 |
| `MAIL_REPLY_TO` | (선택) 답장 받을 주소 |

Resend 를 쓰려면 SMTP_* 대신 `RESEND_API_KEY` 를 넣습니다 (보내는 도메인 인증 필요).

## 5. 확인
사이트 → **면접 안내 메일** → **내 메일로 테스트 발송** → 로그인한 계정 메일로 1통이 오면 완료.

- 받는 사람은 DB에 저장된 지원자 이메일만 쓰입니다.
- Gmail 은 하루 약 500통까지 보낼 수 있습니다.
