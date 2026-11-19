import type { Lang, OrderStatus } from '../types';

export interface I18nDict {
  brand: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;
  popularTitle: string;
  sectionGamesTitle: string;
  sectionTelegramTitle: string;
  sectionSmmTitle: string;
  sectionCardsTitle: string;
  viewAll: string;
  navHome: string;
  navGames: string;
  navWallet: string;
  navHistory: string;
  navProfile: string;
  catAll: string;
  catGames: string;
  catTelegram: string;
  catSmm: string;
  catCards: string;
  selectPackage: string;
  enterDetails: string;
  confirmOrder: string;
  selectedPack: string;
  totalLabel: string;
  uzs: string;
  packsCount: string;
  fromPriceSuffix: string;
  gameSubtitles: Record<string, string>;
  autoLabel: string;
  manualLabel: string;
  checkoutTitle: string;
  timerLabel: string;
  timerExpired: string;
  restartTimer: string;
  cardPayTitle: string;
  cardCopy: string;
  cardCopied: string;
  cardHint: string;
  uploadTitle: string;
  uploadHint: string;
  uploadSelected: string;
  uploadChange: string;
  sendOrderBtn: string;
  sendingOrderBtn: string;
  orderSuccessTitle: string;
  orderSuccessDesc: string;
  goToHistory: string;
  walletTitle: string;
  walletSubtitle: string;
  walletStep1: string;
  walletStep2: string;
  walletStep3: string;
  historyTitle: string;
  historyRefresh: string;
  historyEmptyTitle: string;
  historyEmptyDesc: string;
  historyEmptyCta: string;
  profileTitle: string;
  profileGuest: string;
  profileLanguage: string;
  profileTheme: string;
  themeDark: string;
  themeLight: string;
  profileSupport: string;
  supportDesc: string;
  adminOpenBtn: string;
  adminOpenDesc: string;
  adminTitle: string;
  adminDesc: string;
  adminKeyLabel: string;
  adminKeyPlaceholder: string;
  adminUploadBtn: string;
  adminChangeBtn: string;
  adminDeleteBtn: string;
  adminSavedMsg: string;
  adminDeletedMsg: string;
  backLabel: string;
  errSelectPack: string;
  errInvalidId: string;
  errInvalidUsername: string;
  errInvalidUrl: string;
  errServerRequired: string;
  errReceiptRequired: string;
  errFileTooLarge: string;
  errFileType: string;
  errNetwork: string;
  errTimerExpired: string;
  statusMap: Record<OrderStatus, string>;
  trustFast: string;
  trustSecure: string;
  trustSupport: string;
  coinsUnit: string;
  coinsBalanceTitle: string;
  coinsRuleHint: string;
  banners: Array<{
    kicker: string;
    title: string;
    desc: string;
    cta: string;
    gameId: string;
  }>;
}

export const I18N: Record<Lang, I18nDict> = {
  uz: {
    brand: 'Olmos Pay',
    heroTitle: 'O‘yin donati, Telegram va SMM xizmatlari',
    heroSubtitle: 'PUBG Mobile, Free Fire, Mobile Legends, Bigo Live, Telegram Stars/Gifts/Account hamda SMM xizmatlari.',
    heroCta: 'Katalogga o‘tish',
    popularTitle: 'Ommabop xizmatlar',
    sectionGamesTitle: 'Game Donat',
    sectionTelegramTitle: 'Telegram xizmatlari',
    sectionSmmTitle: 'SMM xizmatlar',
    sectionCardsTitle: 'Raqamli kartalar',
    viewAll: 'Hammasi',
    navHome: 'Asosiy',
    navGames: 'Katalog',
    navWallet: 'To‘lov',
    navHistory: 'Tarix',
    navProfile: 'Profil',
    catAll: 'Barchasi',
    catGames: 'Game Donat',
    catTelegram: 'Telegram',
    catSmm: 'SMM',
    catCards: 'Kartalar',
    selectPackage: 'Paketni tanlang',
    enterDetails: 'Qabul qiluvchi ma’lumotlari',
    confirmOrder: 'To‘lovga o‘tish',
    selectedPack: 'Tanlangan paket',
    totalLabel: 'Jami to‘lov',
    uzs: 'so‘m',
    packsCount: 'paket',
    fromPriceSuffix: 'dan',
    gameSubtitles: {
      pubg: 'Global UC · UID orqali',
      freefire: 'Olmoslar · ID orqali tez yetkazish',
      mlbb: 'Olmoslar · User ID + Server ID',
      bigo: 'Bigo Diamonds · Bigo ID orqali',
      steam: 'Steam hamyon to‘ldirish · Login orqali',
      'tg-stars': 'Telegram Stars · @username orqali',
      'tg-premium': 'Telegram Premium · @username orqali',
      'tg-gifts': 'Telegram Gifts · @username ga sovg‘a',
      'tg-account': 'Kafolatli Telegram hisoblar',
      'tg-giveaway': 'Kanal uchun Premium Giveaway',
      'smm-telegram': '100 so‘m dan · Obunachi, ko‘rish, reaksiya',
      'smm-instagram': '100 so‘m dan · Layk, Reels, obunachi',
      'smm-youtube': '2 000 so‘m dan · Ko‘rish, layk, obunachi',
      'smm-tiktok': '700 so‘m dan · Ko‘rish, layk, obunachi',
    },
    autoLabel: 'Tezkor yetkazish',
    manualLabel: 'Operator orqali',
    checkoutTitle: 'To‘lovni tasdiqlash',
    timerLabel: 'Buyurtma oynasi',
    timerExpired: 'To‘lov vaqti tugadi. Narxni yangilab qayta boshlang.',
    restartTimer: 'Taymerni yangilash',
    cardPayTitle: 'Karta orqali o‘tkazma',
    cardCopy: 'Nusxalash',
    cardCopied: 'Nusxalandi',
    cardHint: 'Aniq summani ko‘rsatilgan kartaga o‘tkazing va chek skrinshotini yuklang.',
    uploadTitle: 'To‘lov cheki rasmi',
    uploadHint: 'JPEG, PNG yoki WebP · Maksimal 10 MB (avtomatik siqiladi)',
    uploadSelected: 'Chek biriktirildi',
    uploadChange: 'Boshqa rasm tanlash',
    sendOrderBtn: 'Buyurtmani yuborish',
    sendingOrderBtn: 'Yuborilmoqda...',
    orderSuccessTitle: 'Buyurtma qabul qilindi',
    orderSuccessDesc: 'Chek adminga yuborildi. Tasdiqlangandan so‘ng 1 daqiqada hisobingizga tushadi.',
    goToHistory: 'Buyurtmalar tarixi',
    walletTitle: 'To‘lov va rekvizitlar',
    walletSubtitle: 'Humo va Uzcard kartalari orqali komissiyasiz to‘lov.',
    walletStep1: '1. O‘yin yoki xizmat paketini tanlang hamda ID / havola kiriting.',
    walletStep2: '2. Ko‘rsatilgan kartaga aniq summani o‘tkazing.',
    walletStep3: '3. Chek rasmini yuklang — admin tasdiqlashi bilan buyurtma bajariladi.',
    historyTitle: 'Buyurtmalarim',
    historyRefresh: 'Yangilash',
    historyEmptyTitle: 'Hali buyurtmalar yo‘q',
    historyEmptyDesc: 'Ilk xaridingizni amalga oshiring — barcha buyurtmalar holati shu yerda ko‘rinadi.',
    historyEmptyCta: 'Katalogni ochish',
    profileTitle: 'Profil va sozlamalar',
    profileGuest: 'Veb mehmon (Telegram Mini App orqali kirish tavsiya etiladi)',
    profileLanguage: 'Ilova tili',
    profileTheme: 'Ko‘rinish rejimi',
    themeDark: 'Tungi',
    themeLight: 'Kunduzgi',
    profileSupport: 'Yordam xizmati',
    supportDesc: 'Buyurtma bo‘yicha savollar bo‘lsa @olmospay_support ga murojaat qiling.',
    adminOpenBtn: 'Admin panel · Rasmlar boshqaruvi',
    adminOpenDesc: 'Barcha o‘yinlar, Telegram va SMM xizmatlari uchun maxsus rasm yuklash.',
    adminTitle: 'Xizmat rasmlari boshqaruvi',
    adminDesc: 'Har bir o‘yin va xizmat kartochkasi uchun o‘z rasmingizni yuklang — barcha mijozlarga darhol ko‘rinadi.',
    adminKeyLabel: 'Admin kaliti (veb-brauzer uchun ixtiyoriy / ADMIN_PANEL_KEY)',
    adminKeyPlaceholder: 'Netlify ADMIN_PANEL_KEY',
    adminUploadBtn: 'Rasm yuklash',
    adminChangeBtn: 'O‘zgartirish',
    adminDeleteBtn: 'O‘chirish',
    adminSavedMsg: 'Rasm saqlandi va do‘konda yangilandi.',
    adminDeletedMsg: 'Maxsus rasm o‘chirildi.',
    backLabel: 'Orqaga',
    errSelectPack: 'Iltimos, avval paket tanlang.',
    errInvalidId: 'O‘yinchi ID noto‘g‘ri kiritildi (kamida 3 ta belgi: harf, raqam, _, ., -).',
    errInvalidUsername: 'Username noto‘g‘ri (masalan: @username, 3–32 ta belgi).',
    errInvalidUrl: 'Havola noto‘g‘ri (masalan: https://t.me/... yoki https://instagram.com/...).',
    errServerRequired: 'Mobile Legends uchun Server / Zone ID ni kiriting.',
    errReceiptRequired: 'Iltimos, to‘lov cheki rasmini yuklang.',
    errFileTooLarge: 'Chek rasmi juda katta. 10 MB dan kichik rasm tanlang yoki uni siqib qayta yuklang.',
    errFileType: 'Faqat rasm fayllari (JPEG, PNG, WebP) qabul qilinadi.',
    errNetwork: 'Tarmoq bilan aloqa uzildi. Internetni tekshirib qayta urinib ko‘ring.',
    errTimerExpired: 'To‘lov taymeri tugagan. Iltimos, taymerni yangilang.',
    statusMap: {
      pending: 'Kutilmoqda',
      processing: 'Bajarilmoqda',
      completed: 'Bajarildi',
      canceled: 'Bekor qilindi',
      manual_pending: 'Operator tekshirmoqda',
    },
    trustFast: '1 daqiqada tushadi',
    trustSecure: 'Tekshirilgan to‘lov',
    trustSupport: '24/7 qo‘llab-quvvatlash',
    coinsUnit: 'tanga',
    coinsBalanceTitle: 'Olmos tanga balansi',
    coinsRuleHint: 'Har xarid uchun bonus: 60 UC = 6 tanga (barcha o‘yin va xizmatlarga)',
    banners: [
      {
        kicker: 'Game Donat · Tezkor yetkazish',
        title: 'PUBG Mobile UC, Free Fire, MLBB va Bigo Live',
        desc: 'Rasmiy yetkazib berish va qulay UZS narxlar.',
        cta: 'Paket tanlash',
        gameId: 'pubg',
      },
      {
        kicker: 'Telegram Xizmatlari',
        title: 'Stars, Premium, Gifts, Account va Giveaway',
        desc: 'Faqat @username orqali — parolsiz va kafolatli.',
        cta: 'Xizmatni ochish',
        gameId: 'tg-stars',
      },
      {
        kicker: 'SMM Xizmatlar',
        title: 'Telegram, Instagram, YouTube va TikTok',
        desc: '100 so‘mdan boshlab sifatli obunachi, ko‘rish va layklar.',
        cta: 'Buyurtma berish',
        gameId: 'smm-telegram',
      },
    ],
  },
  ru: {
    brand: 'Olmos Pay',
    heroTitle: 'Игровой донат, Telegram и SMM сервисы',
    heroSubtitle: 'PUBG Mobile, Free Fire, Mobile Legends, Bigo Live, Telegram Stars/Gifts/Account и SMM продвижение.',
    heroCta: 'Открыть каталог',
    popularTitle: 'Популярные сервисы',
    sectionGamesTitle: 'Игровой донат',
    sectionTelegramTitle: 'Сервисы Telegram',
    sectionSmmTitle: 'SMM услуги',
    sectionCardsTitle: 'Цифровые карты',
    viewAll: 'Все',
    navHome: 'Главная',
    navGames: 'Каталог',
    navWallet: 'Оплата',
    navHistory: 'История',
    navProfile: 'Профиль',
    catAll: 'Все',
    catGames: 'Игры',
    catTelegram: 'Telegram',
    catSmm: 'SMM',
    catCards: 'Карты',
    selectPackage: 'Выберите пакет',
    enterDetails: 'Данные получателя',
    confirmOrder: 'Перейти к оплате',
    selectedPack: 'Выбранный пакет',
    totalLabel: 'Итого к оплате',
    uzs: 'сум',
    packsCount: 'пакетов',
    fromPriceSuffix: 'от',
    gameSubtitles: {
      pubg: 'Global UC · По Character ID',
      freefire: 'Алмазы · Быстрая доставка по ID',
      mlbb: 'Алмазы · User ID + Server ID',
      bigo: 'Bigo Diamonds · По Bigo ID',
      steam: 'Пополнение Steam · По логину',
      'tg-stars': 'Telegram Stars · По @username',
      'tg-premium': 'Telegram Premium · По @username',
      'tg-gifts': 'Telegram Gifts · Подарок по @username',
      'tg-account': 'Аккаунты Telegram с гарантией',
      'tg-giveaway': 'Premium Giveaway для канала',
      'smm-telegram': 'От 100 сум · Подписчики, просмотры',
      'smm-instagram': 'От 100 сум · Лайки, Reels, подписчики',
      'smm-youtube': 'От 2 000 сум · Просмотры, лайки',
      'smm-tiktok': 'От 700 сум · Просмотры, лайки',
    },
    autoLabel: 'Быстрая доставка',
    manualLabel: 'Через оператора',
    checkoutTitle: 'Подтверждение оплаты',
    timerLabel: 'Окно оплаты',
    timerExpired: 'Время оплаты истекло. Обновите таймер для продолжения.',
    restartTimer: 'Обновить таймер',
    cardPayTitle: 'Перевод на карту',
    cardCopy: 'Копировать',
    cardCopied: 'Скопировано',
    cardHint: 'Переведите точную сумму на указанную карту и загрузите скриншот чека.',
    uploadTitle: 'Чек об оплате',
    uploadHint: 'JPEG, PNG или WebP · До 10 МБ (автоматическое сжатие)',
    uploadSelected: 'Чек прикреплён',
    uploadChange: 'Выбрать другое фото',
    sendOrderBtn: 'Отправить заказ',
    sendingOrderBtn: 'Отправка...',
    orderSuccessTitle: 'Заказ принят',
    orderSuccessDesc: 'Чек отправлен администратору. После подтверждения зачисление за 1 минуту.',
    goToHistory: 'История заказов',
    walletTitle: 'Оплата и реквизиты',
    walletSubtitle: 'Оплата через Humo и Uzcard без лишних комиссий.',
    walletStep1: '1. Выберите игру или услугу и введите ID / ссылку.',
    walletStep2: '2. Переведите точную сумму на указанную карту.',
    walletStep3: '3. Загрузите фото чека — администратор подтвердит и выполнит заказ.',
    historyTitle: 'Мои заказы',
    historyRefresh: 'Обновить',
    historyEmptyTitle: 'Заказов пока нет',
    historyEmptyDesc: 'Сделайте первый заказ — статус доставки будет отображаться здесь в реальном времени.',
    historyEmptyCta: 'Перейти в каталог',
    profileTitle: 'Профиль и настройки',
    profileGuest: 'Веб-гость (рекомендуется открыть через Telegram Mini App)',
    profileLanguage: 'Язык приложения',
    profileTheme: 'Тема оформления',
    themeDark: 'Тёмная',
    themeLight: 'Светлая',
    profileSupport: 'Поддержка',
    supportDesc: 'По всем вопросам обращайтесь в @olmospay_support.',
    adminOpenBtn: 'Админ-панель · Изображения',
    adminOpenDesc: 'Загрузите собственные обложки для всех игр, Telegram и SMM услуг.',
    adminTitle: 'Управление обложками',
    adminDesc: 'Загрузите обложку для каждой игры и услуги — она сразу обновится в каталоге для всех.',
    adminKeyLabel: 'Ключ администратора (для веб-браузера / ADMIN_PANEL_KEY)',
    adminKeyPlaceholder: 'Netlify ADMIN_PANEL_KEY',
    adminUploadBtn: 'Загрузить фото',
    adminChangeBtn: 'Изменить',
    adminDeleteBtn: 'Удалить',
    adminSavedMsg: 'Изображение сохранено в каталоге.',
    adminDeletedMsg: 'Пользовательское изображение удалено.',
    backLabel: 'Назад',
    errSelectPack: 'Пожалуйста, выберите пакет.',
    errInvalidId: 'Некорректный ID игрока (минимум 3 символа).',
    errInvalidUsername: 'Некорректный username (например: @username, 3–32 символа).',
    errInvalidUrl: 'Некорректная ссылка (например: https://t.me/... или https://instagram.com/...).',
    errServerRequired: 'Для Mobile Legends укажите Server / Zone ID.',
    errReceiptRequired: 'Загрузите изображение чека об оплате.',
    errFileTooLarge: 'Изображение чека слишком большое. Выберите файл меньше 10 МБ или сожмите его.',
    errFileType: 'Допускаются только изображения (JPEG, PNG, WebP).',
    errNetwork: 'Ошибка сети. Проверьте интернет и повторите попытку.',
    errTimerExpired: 'Время оплаты истекло. Обновите таймер.',
    statusMap: {
      pending: 'Ожидает',
      processing: 'Выполняется',
      completed: 'Выполнен',
      canceled: 'Отменён',
      manual_pending: 'На проверке',
    },
    trustFast: 'За 1 минуту',
    trustSecure: 'Проверенная оплата',
    trustSupport: 'Поддержка 24/7',
    coinsUnit: 'монет',
    coinsBalanceTitle: 'Баланс монет Olmos',
    coinsRuleHint: 'Бонус за покупку: 60 UC = 6 монет (на все игры и услуги)',
    banners: [
      {
        kicker: 'Game Donat · Моментально',
        title: 'PUBG Mobile UC, Free Fire, MLBB и Bigo Live',
        desc: 'Надёжная доставка и честные цены в сумах.',
        cta: 'Выбрать пакет',
        gameId: 'pubg',
      },
      {
        kicker: 'Сервисы Telegram',
        title: 'Stars, Premium, Gifts, Account и Giveaway',
        desc: 'Только по @username — без паролей и риска.',
        cta: 'Оформить',
        gameId: 'tg-stars',
      },
      {
        kicker: 'SMM услуги',
        title: 'Telegram, Instagram, YouTube и TikTok',
        desc: 'Подписчики, просмотры и реакции от 100 сум.',
        cta: 'Выбрать услугу',
        gameId: 'smm-telegram',
      },
    ],
  },
  en: {
    brand: 'Olmos Pay',
    heroTitle: 'Game Top-Ups, Telegram & SMM Services',
    heroSubtitle: 'PUBG Mobile, Free Fire, Mobile Legends, Bigo Live, Telegram Stars/Gifts/Account, and SMM growth.',
    heroCta: 'Browse Catalog',
    popularTitle: 'Featured Services',
    sectionGamesTitle: 'Game Top-Ups',
    sectionTelegramTitle: 'Telegram Services',
    sectionSmmTitle: 'SMM Services',
    sectionCardsTitle: 'Digital Cards',
    viewAll: 'View all',
    navHome: 'Home',
    navGames: 'Catalog',
    navWallet: 'Pay',
    navHistory: 'Orders',
    navProfile: 'Profile',
    catAll: 'All',
    catGames: 'Games',
    catTelegram: 'Telegram',
    catSmm: 'SMM',
    catCards: 'Cards',
    selectPackage: 'Choose a package',
    enterDetails: 'Recipient details',
    confirmOrder: 'Continue to payment',
    selectedPack: 'Selected package',
    totalLabel: 'Total due',
    uzs: 'UZS',
    packsCount: 'packs',
    fromPriceSuffix: 'from',
    gameSubtitles: {
      pubg: 'Global UC · Via Character ID',
      freefire: 'Diamonds · Fast Player ID delivery',
      mlbb: 'Diamonds · User ID + Server ID',
      bigo: 'Bigo Diamonds · Via Bigo ID',
      steam: 'Steam Wallet · Login top-up',
      'tg-stars': 'Telegram Stars · Via @username',
      'tg-premium': 'Telegram Premium · Via @username',
      'tg-gifts': 'Telegram Gifts · Send to @username',
      'tg-account': 'Verified Telegram Accounts',
      'tg-giveaway': 'Channel Premium Giveaway',
      'smm-telegram': 'From 100 UZS · Members, views, reactions',
      'smm-instagram': 'From 100 UZS · Likes, Reels, followers',
      'smm-youtube': 'From 2 000 UZS · Views, likes, subscribers',
      'smm-tiktok': 'From 700 UZS · Views, likes, followers',
    },
    autoLabel: 'Fast delivery',
    manualLabel: 'Operator verified',
    checkoutTitle: 'Confirm payment',
    timerLabel: 'Payment window',
    timerExpired: 'Payment timer expired. Restart timer to proceed.',
    restartTimer: 'Restart timer',
    cardPayTitle: 'Card transfer',
    cardCopy: 'Copy',
    cardCopied: 'Copied',
    cardHint: 'Transfer the exact amount to the card below and upload your receipt screenshot.',
    uploadTitle: 'Payment receipt',
    uploadHint: 'JPEG, PNG or WebP · Max 10 MB (auto-compressed)',
    uploadSelected: 'Receipt attached',
    uploadChange: 'Choose another image',
    sendOrderBtn: 'Submit order',
    sendingOrderBtn: 'Submitting...',
    orderSuccessTitle: 'Order received',
    orderSuccessDesc: 'Your receipt has been sent. Delivered within 1 minute after confirmation.',
    goToHistory: 'Order history',
    walletTitle: 'Payment details',
    walletSubtitle: 'Direct Humo and Uzcard transfers with transparent UZS pricing.',
    walletStep1: '1. Select your service package and enter ID / link.',
    walletStep2: '2. Transfer the exact total to the listed card number.',
    walletStep3: '3. Upload your receipt — order is fulfilled immediately after confirmation.',
    historyTitle: 'My orders',
    historyRefresh: 'Refresh',
    historyEmptyTitle: 'No orders yet',
    historyEmptyDesc: 'Place your first order — live fulfillment status will appear here.',
    historyEmptyCta: 'Open catalog',
    profileTitle: 'Profile & settings',
    profileGuest: 'Web guest (open inside Telegram Mini App for instant notifications)',
    profileLanguage: 'Language',
    profileTheme: 'Appearance',
    themeDark: 'Dark',
    themeLight: 'Light',
    profileSupport: 'Support',
    supportDesc: 'Need help with an order? Message @olmospay_support.',
    adminOpenBtn: 'Admin Panel · Cover Images',
    adminOpenDesc: 'Upload custom artwork for every game, Telegram, and SMM service.',
    adminTitle: 'Service Cover Manager',
    adminDesc: 'Upload a custom image for each service — it updates live across the entire storefront.',
    adminKeyLabel: 'Admin Secret Key (for web browser / ADMIN_PANEL_KEY)',
    adminKeyPlaceholder: 'Netlify ADMIN_PANEL_KEY',
    adminUploadBtn: 'Upload image',
    adminChangeBtn: 'Replace',
    adminDeleteBtn: 'Remove',
    adminSavedMsg: 'Cover image saved and published.',
    adminDeletedMsg: 'Custom cover removed.',
    backLabel: 'Back',
    errSelectPack: 'Please select a package first.',
    errInvalidId: 'Invalid Player ID (at least 3 valid characters).',
    errInvalidUsername: 'Invalid username (e.g. @username, 3–32 characters).',
    errInvalidUrl: 'Invalid link (e.g. https://t.me/... or https://instagram.com/...).',
    errServerRequired: 'Please enter your Mobile Legends Server / Zone ID.',
    errReceiptRequired: 'Please upload a payment receipt image.',
    errFileTooLarge: 'Receipt image is too large. Choose an image under 10 MB or compress it before uploading.',
    errFileType: 'Only JPEG, PNG, or WebP images are supported.',
    errNetwork: 'Network error. Please check your connection and try again.',
    errTimerExpired: 'Payment window expired. Please restart the timer.',
    statusMap: {
      pending: 'Pending',
      processing: 'Processing',
      completed: 'Completed',
      canceled: 'Canceled',
      manual_pending: 'Under review',
    },
    trustFast: '1 min delivery',
    trustSecure: 'Verified payment',
    trustSupport: '24/7 support',
    coinsUnit: 'coins',
    coinsBalanceTitle: 'Olmos Coin Balance',
    coinsRuleHint: 'Reward on every purchase: 60 UC = 6 coins across all services',
    banners: [
      {
        kicker: 'Game Top-Ups · Instant',
        title: 'PUBG Mobile UC, Free Fire, MLBB & Bigo Live',
        desc: 'Verified delivery with transparent UZS pricing.',
        cta: 'Choose package',
        gameId: 'pubg',
      },
      {
        kicker: 'Telegram Services',
        title: 'Stars, Premium, Gifts, Account & Giveaway',
        desc: 'Delivered via @username — no password needed.',
        cta: 'Order now',
        gameId: 'tg-stars',
      },
      {
        kicker: 'SMM Growth',
        title: 'Telegram, Instagram, YouTube & TikTok',
        desc: 'Followers, views, and engagement starting from 100 UZS.',
        cta: 'Browse SMM',
        gameId: 'smm-telegram',
      },
    ],
  },
};
