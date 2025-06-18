const express = require('express');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);

// معدل الطلبات المسموح به (100 طلب كل 15 دقيقة)
const apiLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 15 دقيقة
  max: 40,
  message: { error: 'لقد تجاوزت عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً' },
  skip: (req) => 
    req.path.startsWith('/admin.html') || 
    req.path === '/server.js' ||
    req.path === '/package.json'
});

app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// تطبيق rate limiter على جميع المسارات
app.use(apiLimiter);

const adminAccessCheck = (req, res, next) => {
  const allowedIp = process.env.ADMIN_ALLOWED_IP;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (clientIp === allowedIp) {
    return next();
  }

  res.status(404).send('404 Not Found');
};

app.get(['/admin.html', '/server.js', '/package.json'], adminAccessCheck, (req, res) => {
  const filePath = path.join(__dirname, req.path);

  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  res.status(404).send('404 Not Found');
});

const apiIpCheck = (req, res, next) => {
  const allowedIp = process.env.ADMIN_ALLOWED_IP;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (clientIp === allowedIp) {
    return next();
  }

  res.status(403).json({ error: 'Forbidden' });
};

const strictAccessCheck = (req, res, next) => {
  const allowedDomains = [
    'https://careful-burnt-honesty.glitch.me',
    'http://localhost:3000'
  ];

  const requestOrigin = req.get('Origin');
  const requestReferer = req.get('Referer');

  if (req.path === '/data.json') {
    const isAllowed = allowedDomains.some(domain =>
      requestOrigin === domain ||
      (requestReferer && requestReferer.startsWith(domain))
    );

    if (!isAllowed) {
      return res.status(403).json({ error: 'forbidden' });
    }
  }

  next();
};

app.use(strictAccessCheck);

// rate limiter خاص بمسار الحفظ
const saveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'لقد تجاوزت عدد عمليات الحفظ المسموح بها' }
});

app.post('/api/save', apiIpCheck, saveLimiter, (req, res) => {
  try {
    fs.writeFileSync('data.json', JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true, message: 'تم الحفظ بنجاح' });
  } catch (error) {
    res.status(500).json({ error: 'فشل في حفظ البيانات' });
  }
});

app.get('/api/data', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'فشل في قراءة الملف' });
  }
});

app.get('/data.json', (req, res) => {
  res.status(403).json({ error: 'forbidden' });
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`الخادم يعمل على http://localhost:${port}`);
});