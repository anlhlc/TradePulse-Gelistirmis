# 🔒 Secure Binance Futures Dashboard

Güvenli, şifre korumalı Binance Futures Trading Terminal.

## Özellikler

- 🔐 Kullanıcı adı ve şifre ile güvenli giriş
- 🛡️ Brute-force koruması (Rate limiting)
- 🔒 Sunucu tarafında şifre hashleme (bcrypt)
- 📊 Tüm orijinal dashboard özellikleri korundu
- 🚀 Her yerden erişim

## Kurulum

### 1. Bağımlılıkları Yükleyin

```bash
npm install
```

### 2. Şifreyi Özelleştirin

`.env` dosyasını düzenleyin:

```env
SESSION_SECRET=buraya-çok-güçlü-bir-anahtar-en-az-32-karakter
ADMIN_PASSWORD=SizinGüvenliŞifreniz!
PORT=3000
```

**Önemli:** `SESSION_SECRET` değerini mutlaka değiştirin!

### 3. Sunucuyu Başlatın

```bash
# Geliştirme modu
npm run dev

# veya
node server.js
```

### 4. Tarayıcıda Açın

```
http://localhost:3000
```

## Varsayılan Giriş Bilgileri

- **Kullanıcı adı:** `admin`
- **Şifre:** `BinanceSecure2024!`

⚠️ **İlk girişten sonra şifreyi değiştirmeyi unutmayın!**

## Deployment

### Render.com (Ücretsiz)

1. GitHub'da bir repository oluşturun
2. Projeyi push edin
3. [Render.com](https://render.com)'a giriş yapın
4. "New Web Service" seçin
5. Repository'nizi seçin
6. Build Command: `npm install`
7. Start Command: `npm start`
8. Environment Variables ekleyin:
   - `SESSION_SECRET`: Güçlü bir anahtar
   - `ADMIN_PASSWORD`: İstediğiniz şifre
9. Create Web Service'e tıklayın

### Railway.app

1. [Railway.app](https://railway.app)'a giriş yapın
2. "New Project" > "Deploy from GitHub"
3. Repository'nizi seçin
4. Environment Variables ekleyin
5. Deploy!

### VPS (DigitalOcean, Linode, vb.)

```bash
# Sunucuya bağlanın
ssh root@your-server-ip

# Node.js yükleyin
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Projeyi klonlayın
git clone https://your-repo-url.git
cd secure-dashboard

# Bağımlılıkları yükleyin
npm install

# PM2 ile çalıştırın (otomatik yeniden başlatma için)
npm install -g pm2
pm2 start server.js --name "dashboard"
pm2 startup
pm2 save

# Nginx ile HTTPS kurun (önerilir)
```

## Güvenlik Önerileri

1. **Güçlü şifre kullanın:** En az 12 karakter, büyük/küçük harf, rakam ve özel karakter
2. **HTTPS kullanın:** Üretim ortamında SSL sertifikası şart
3. **Şifreyi düzenli değiştirin:** API şifrelerini periyodik olarak güncelleyin
4. **Rate limiting aktif tutun:** Brute-force saldırılarına karşı koruma
5. **Session süresini sınırlayın:** Uzun süre açık kalan oturumları sonlandırın

## API Endpoints

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/login` | POST | Giriş yap |
| `/logout` | GET | Çıkış yap |
| `/` | GET | Dashboard (korumalı) |
| `/api/session` | GET | Oturum bilgisi |
| `/api/change-password` | POST | Şifre değiştir |

## Sorun Giderme

### "EADDRINUSE" Hatası
```bash
# Port kullanımda ise
lsof -ti:3000 | xargs kill -9
# veya farklı port kullanın
PORT=8080 npm start
```

### Giriş Yapılamıyor
- Şifrenin doğru olduğunu kontrol edin
- `.env` dosyasının kaydedildiğini doğrulayın
- Sunucuyu yeniden başlatın: `pm2 restart dashboard`

### Static Dosyalar Yüklenmiyor
- `public` klasöründe olduklarını kontrol edin
- Yolların `/` ile başladığını doğrulayın

## Lisans

MIT License
