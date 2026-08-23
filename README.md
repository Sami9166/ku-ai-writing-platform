# KU AI Writing Platform

고려대학교 AI 협업 과정 기록 플랫폼입니다.

학생은 과제를 작성하면서 AI와 대화하고, 답변의 문장을 직접 선택해 타당함을 판단하거나 검증 방법을 실행합니다. 교수자는 학생의 제출물과 AI 협업 기록을 확인하고, 루브릭 반영률과 평가 점수를 입력할 수 있습니다.

## 주요 기능

- 학생용 과제 작성 화면과 AI 대화
- AI 답변 문장 하이라이트와 타당함·확인 필요·수정 필요 판단
- 추가 질문, 참고 문헌 확인, 직접 검색
- 임시 저장과 최종 제출
- 교수자용 학생·과제 선택 화면
- 학생 제출물, AI 탐구 기록, 협업 요약 확인
- 다섯 가지 루브릭 항목의 1~5점 평가
- 대화 기록과 평가 결과의 MySQL 저장

AI 답변 본문은 하이라이트 기능과 문장 일치를 위해 일반 텍스트로 표시합니다. 참고 링크는 답변 아래 별도 영역에서 확인합니다.

## 기술 구성

- 프론트엔드: React 19, TypeScript, vinext/Vite
- 백엔드: Java 17, Spring Boot 3.4, Maven
- 데이터베이스: MySQL 8.4, Spring JDBC, Flyway
- 검색: 자체 실행하는 SearXNG JSON API
- 학생 AI: Groq API
- 교수자 분석: Google AI Studio 또는 Groq

## 실행 환경

다음 도구가 필요합니다.

- Node.js "22.14.0 이상 24.0.0 미만" 또는 "24.19.0 이상"
- npm
- Java 17과 Maven
- Docker와 Docker Compose
- 학생 AI를 사용할 경우 Groq API 키
- 교수자 분석을 사용할 경우 Google AI Studio API 키

발표 서버에서는 Node 22 LTS를 권장합니다. Node 24.13.0은 현재 Windows에서 Vite 8 빌드가 비정상 종료할 수 있으므로, 지원 범위에 포함된 Node 22.14.0 또는 24.19.0 이상을 사용하세요.

버전 확인:

~~~
node --version
java --version
mvn --version
docker --version
docker compose version
~~~

## 로컬에서 실행하기

### 1. 의존성과 환경 변수 준비

프로젝트 루트에서 실행합니다.

Windows PowerShell:

~~~powershell
npm install
Copy-Item .env.example .env
~~~

macOS/Linux:

~~~bash
npm install
cp .env.example .env
~~~

.env에 필요한 API 키를 입력합니다. 이 파일은 로컬 비밀 설정이므로 GitHub에 올리지 않습니다.

### 2. MySQL과 SearXNG 실행

~~~bash
docker compose up -d mysql searxng
docker compose ps
~~~

기본 접속 정보는 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| 데이터베이스 | ku_ai_trace |
| 사용자 | ku_ai |
| 비밀번호 | ku_ai_local |
| MySQL 포트 | 3306 |
| SearXNG 주소 | http://localhost:8080 |

MySQL과 SearXNG 포트는 로컬호스트에만 열립니다.

### 3. Spring API 실행

새 터미널에서 실행합니다.

~~~bash
npm run api
~~~

API 기본 주소는 http://localhost:4000입니다. 처음 실행하면 Flyway가 데이터베이스 마이그레이션을 적용합니다.

상태 확인:

~~~bash
curl http://localhost:4000/api/health
~~~

Windows PowerShell에서는 다음 명령도 사용할 수 있습니다.

~~~powershell
Invoke-RestMethod http://localhost:4000/api/health
~~~

### 4. 프론트엔드 실행

또 다른 터미널에서 실행합니다.

~~~bash
npm run dev
~~~

브라우저에서 http://localhost:3000을 엽니다.

현재 화면의 역할 전환 기능으로 학생용 화면과 교수자용 화면을 확인할 수 있습니다.

## 환경 변수

주요 설정은 .env.example에서 확인할 수 있습니다.

| 변수 | 설명 |
| --- | --- |
| DB_URL | MySQL JDBC 주소 |
| DB_USERNAME | MySQL 사용자 |
| DB_PASSWORD | MySQL 비밀번호 |
| API_PORT | Spring API 포트 |
| GROQ_API_KEY | 학생 AI 대화용 Groq 키 |
| STUDENT_MODEL | 학생 AI 모델 |
| GOOGLE_API_KEY | 교수자 분석용 Google AI Studio 키 |
| PROFESSOR_PROVIDER | 교수자 분석 공급자(google 또는 groq) |
| PROFESSOR_MODEL | 교수자 분석 모델 |
| SEARCH_ENABLED | SearXNG 검색 사용 여부 |
| SEARCH_API_URL | SearXNG JSON API 주소 |

API 키가 없을 때도 화면과 기본 로컬 동작을 확인할 수 있지만, 실제 AI 응답을 사용하려면 해당 키가 필요합니다.

## AI에 전달하는 대화 기록

대화 전체는 DB에 저장합니다. 다만 API 요청이 지나치게 커지지 않도록 AI에게는 최근 대화와 요약 중심의 문맥만 전달합니다. 이 제한은 모델 요청에만 적용되며, 교수자 화면에서 확인하는 저장 기록을 삭제하거나 줄이지는 않습니다.

## DB 대화 기록 초기화

대화 원문과 요약만 삭제하려면 MySQL 컨테이너에 접속합니다.

~~~bash
docker compose exec mysql mysql -uku_ai -pku_ai_local ku_ai_trace
~~~

접속 후 실행합니다.

~~~sql
START TRANSACTION;
DELETE FROM conversation_summaries;
DELETE FROM ai_interactions;
COMMIT;
~~~

이 명령은 학생 정보, 제출물, 평가 점수와 루브릭 결과는 보존합니다. DB 전체를 지우는 docker compose down -v는 정말 초기화가 필요할 때만 사용하세요.

## 검증 명령

~~~bash
npm run lint
npm test
npm run api:build
~~~

Windows PowerShell에서 npm.ps1 실행 정책 오류가 나면 같은 명령을 npm.cmd로 실행하면 됩니다.

## 폴더 구조

~~~text
app/                 학생·교수자 프론트엔드와 API 클라이언트
backend/             Spring Boot API, Flyway 마이그레이션, 테스트
public/              로고와 화면 이미지
tests/               프론트엔드 렌더링 테스트
searxng/             SearXNG 설정
compose.yaml         로컬 MySQL과 SearXNG 실행 설정
.env.example         환경 변수 예시
~~~

## 발표 배포

발표용 서버는 AWS EC2에 애플리케이션과 Docker Compose를 올리고, 외부 접속은 Cloudflare Tunnel로 연결하는 구성을 사용합니다.

- API 키와 DB 비밀번호는 EC2의 .env에만 저장합니다.
- GitHub에는 .env, .pem, 로그와 빌드 결과를 올리지 않습니다.
- 보안 그룹에서는 SSH를 본인 IP에만 허용합니다.
- MySQL과 SearXNG 포트는 외부에 직접 공개하지 않습니다.
