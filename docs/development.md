# دليل التطوير (Development Guide)

## 1. المتطلبات الأولية (Prerequisites)
- **Node.js**: الإصدار 20.0.0 أو أحدث.
- **npm**: مدير الحزم المرافق لـ Node.js.
- **PostgreSQL**: قاعدة بيانات جاهزة ومتاحة.
- **PowerShell / Terminal**: بيئة تشغيل الأوامر.

---

## 2. إعداد البيئة المحلية (Local Setup)

1. **استنساخ المستودع والدخول للمجلد**:
   ```bash
   git clone <repo-url>
   cd "Construction Control"
   ```

2. **تهيئة ملف متغيرات البيئة**:
   انسخ ملف `.env.example` إلى `.env`:
   ```bash
   cp .env.example .env
   ```
   تأكد من ضبط:
   - `DATABASE_URL`: رابط الاتصال بقاعدة بيانات PostgreSQL.
   - `NEXTAUTH_SECRET`: مفتاح أمان عشوائي بتشفير قوي (openssl rand -base64 32).
   - `NEXTAUTH_URL`: رابط التطبيق المحلي (افتراضياً: `http://localhost:3000`).

3. **تثبيت الحزم**:
   ```bash
   npm install
   ```

4. **توليد عميل Prisma وتطبيق الهجرات**:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **تشغيل بيئة التطوير**:
   ```bash
   npm run dev
   ```

---

## 3. الأوامر المعتمدة (Scripts)

| الأمر | الوصف |
|---|---|
| `npm run dev` | تشغيل خادم التطوير مع المراقبة والتحديث اللحظي |
| `npm run build` | بناء نسخة الإنتاج والتحقق من سلامة البناء |
| `npm run start` | تشغيل نسخة الإنتاج الجاهزة |
| `npm run typecheck` | فحص صارم للأنواع عبر TypeScript (`tsc --noEmit`) |
| `npm run lint` | فحص جودة الكود والالتزام بالمعايير عبر ESLint |
| `npm run test` | تشغيل اختبارات الوحدة عبر Vitest |
| `npm run test:watch` | تشغيل Vitest في وضع المراقبة المستمرة |
| `npm run test:e2e` | تشغيل اختبارات التكامل النهائي عبر Playwright |
| `npm run db:generate` | توليد أنواع Prisma Client بعد تعديل الـ schema |
| `npm run db:migrate` | إنشاء وتطبيق ملفات الهجرة لقاعدة البيانات |

---

## 4. قواعد كتابة الكود (Code Conventions)

- **TypeScript Strict Mode**: منع استخدام `any` غير الصريح، والالتزام بالأنواع الصارمة في كافة الدوال والوحدات.
- **التعامل مع الأموال**: استخدام `Decimal` حصراً في كافة الحسابات، ومنع العمليات الحسابية للأرقام العشرية عبر JavaScript floats.
- **التصميم بالاتجاه العربي (RTL)**:
  - استخدام الفئات المنطقية (Logical Properties) مثل `ms-4`, `pe-2`, `start-0`, `border-s`.
  - تفادي `ml-*`, `mr-*`, `left-*`, `right-*`.
- **التسجيل (Logging)**:
  - حظر استخدام `console.log` في كود التطبيق.
  - استخدام وحدة التسجيل الموحدة `logger` من `@/lib/logger`.
- **التحقق من المدخلات (Validation)**:
  - كافة البيانات القادمة من الواجهة يجب فحصها عبر Zod في `@/lib/validation`.
