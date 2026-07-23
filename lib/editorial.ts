export type EditorialImagePath = `/images/editorial/${string}.webp`;

export type CollectionId =
  | "first-light-in-the-field"
  | "the-conservatory-hour"
  | "after-rain-the-library"
  | "dinner-at-the-long-table";

export interface EditorialLink {
  readonly label: string;
  readonly labelEn?: string;
  readonly href: string;
}

export interface EstateCollection {
  readonly id: CollectionId;
  readonly slug: CollectionId;
  readonly title: string;
  readonly titleZh: string;
  readonly moment: string;
  readonly summary: string;
  readonly description: readonly string[];
  readonly image: EditorialImagePath;
  readonly imageAlt: string;
  readonly href: string;
}

export interface EstateJournalEntry {
  readonly id: string;
  readonly slug: string;
  readonly collectionId: CollectionId;
  readonly title: string;
  readonly titleZh: string;
  readonly excerpt: string;
  readonly body: readonly string[];
  readonly image: EditorialImagePath;
  readonly imageAlt: string;
  readonly readingTime: string;
  readonly href: string;
}

export interface FooterNavigationGroup {
  readonly title: string;
  readonly links: readonly EditorialLink[];
}

export const estateCollections = [
  {
    id: "first-light-in-the-field",
    slug: "first-light-in-the-field",
    title: "First Light in the Field",
    titleZh: "田野初光",
    moment: "06:40 — The grounds",
    summary: "為晨霧、馬廄與一段不被催促的路程而備。",
    description: [
      "一天從戶外開始。清晨的風穿過樹籬，衣著需要保留活動的餘裕，也要能在回到屋內時依然得體。",
      "本章以俐落的針織、襯衫與剪裁單品構成當代鄉野衣櫥；馬術與田野只留下節奏，不成為裝扮。",
    ],
    image: "/images/editorial/first-light-in-the-field.webp",
    imageAlt:
      "清晨薄霧中的英國莊園草地，一位當代紳士牽著獵犬沿樹籬步行",
    href: "/collections/first-light-in-the-field",
  },
  {
    id: "the-conservatory-hour",
    slug: "the-conservatory-hour",
    title: "The Conservatory Hour",
    titleZh: "溫室時刻",
    moment: "15:20 — The conservatory",
    summary: "午後的光落在亞麻、珍珠與尚未修剪的枝葉上。",
    description: [
      "溫室是莊園裡最接近季節的房間。午後光線緩慢移動，服裝的輪廓與飾物的微光，也因此顯得更加清楚。",
      "長洋裝、柔軟針織、珍珠與花器在此相遇；不是為了盛裝，而是讓日常擁有從容的形狀。",
    ],
    image: "/images/editorial/the-conservatory-hour.webp",
    imageAlt:
      "當代成熟女性站在英國莊園溫室內，午後光線映在低飽和服裝與綠植上",
    href: "/collections/the-conservatory-hour",
  },
  {
    id: "after-rain-the-library",
    slug: "after-rain-the-library",
    title: "After Rain, the Library",
    titleZh: "雨後，藏書室",
    moment: "17:10 — The library",
    summary: "把潮濕外衣留在門邊，讓皮革、紙張與木頭接續午後。",
    description: [
      "雨聲停下後，藏書室仍保留一點昏暗。桌上的腕錶、筆記本與公事包，不急著證明身分，只安靜承接被記下的事。",
      "本章收攏書寫、收納與隨身物件，以耐看的比例和觸感，留住一段可以專注的時間。",
    ],
    image: "/images/editorial/after-rain-the-library.webp",
    imageAlt:
      "雨後的當代英國莊園藏書室，木桌上放著筆記本與皮件，窗外仍帶水氣",
    href: "/collections/after-rain-the-library",
  },
  {
    id: "dinner-at-the-long-table",
    slug: "dinner-at-the-long-table",
    title: "Dinner at the Long Table",
    titleZh: "長桌晚宴",
    moment: "20:00 — The dining room",
    summary: "燭光不為排場而亮，只為讓一頓晚餐停留得更久。",
    description: [
      "夜晚使屋內重新聚攏。玻璃杯、織品與木製器物依次上桌，香氣則停在談話之外，不搶走任何人的注意。",
      "這是一組關於款待的日常物件：足以陪伴正式晚餐，也能在平常的星期三被自然使用。",
    ],
    image: "/images/editorial/dinner-at-the-long-table.webp",
    imageAlt:
      "當代英國莊園的長桌晚餐場景，成熟女性與紳士在克制燭光中交談",
    href: "/collections/dinner-at-the-long-table",
  },
] as const satisfies readonly EstateCollection[];

export const estateJournalEntries = [
  {
    id: "journal-before-the-house-wakes",
    slug: "before-the-house-wakes",
    collectionId: "first-light-in-the-field",
    title: "Before the House Wakes",
    titleZh: "屋舍甦醒以前",
    excerpt:
      "清晨的衣著不必表明目的；它只需要跟得上薄霧、碎石路，以及尚未完全醒來的一天。",
    body: [
      "莊園最安靜的時刻，往往早於屋內的第一盞燈。草地仍含著夜裡的水氣，遠處樹籬的輪廓比平常柔和。出門的人不需要特別宣告行程，只在領口留一點空間，把針織衫搭在肩上。",
      "鄉野衣著真正可貴之處，不在於複製某個年代，而在於懂得回應天候與動作。牛津襯衫可以挽起袖口，西裝外套應容許自在步行，百慕達短褲也需要足夠克制的長度。每一件衣服都先服務生活，再成為風格。",
      "回程時，獵犬已先一步走向屋門。鞋底帶回少許泥土，衣料留下晨風的溫度。這些微小痕跡不必被立刻抹去；它們讓物件逐漸屬於使用它的人。",
    ],
    image: "/images/editorial/before-the-house-wakes.webp",
    imageAlt:
      "清晨的英國鄉間步道上，一位穿著現代剪裁服裝的紳士與獵犬同行",
    readingTime: "閱讀約 3 分鐘",
    href: "/journal/before-the-house-wakes",
  },
  {
    id: "journal-the-quiet-geometry-of-a-conservatory",
    slug: "the-quiet-geometry-of-a-conservatory",
    collectionId: "the-conservatory-hour",
    title: "The Quiet Geometry of a Conservatory",
    titleZh: "溫室裡的靜默秩序",
    excerpt:
      "玻璃、枝葉與午後斜光替空間畫出尺度，也提醒我們：優雅常由留白開始。",
    body: [
      "午後三點過後，溫室的光開始有了方向。玻璃框架把天空分成細長的格子，枝葉則越過那些界線生長。規矩與自然並置，沒有一方需要說服另一方。",
      "穿著也可以保留同樣的分寸。長洋裝順著步伐移動，針織停在身體附近，珍珠只接住一瞬光線。真正耐看的組合通常不靠層層裝飾，而是讓材質、輪廓與人的姿態彼此留有餘地。",
      "桌邊的花器不必盛滿。幾枝從庭園帶回的葉片，已足以記錄季節。當日常物件不再急著成為焦點，房間裡的人反而更容易被看見。",
    ],
    image:
      "/images/editorial/the-quiet-geometry-of-a-conservatory.webp",
    imageAlt:
      "英國莊園玻璃溫室內，一位當代成熟女性在植物與午後斜光之間整理花枝",
    readingTime: "閱讀約 3 分鐘",
    href: "/journal/the-quiet-geometry-of-a-conservatory",
  },
  {
    id: "journal-notes-kept-after-rain",
    slug: "notes-kept-after-rain",
    collectionId: "after-rain-the-library",
    title: "Notes Kept After Rain",
    titleZh: "雨後留在紙上的事",
    excerpt:
      "有些念頭需要等雨停，才知道值得寫下的是結論，還是窗邊那段沉默。",
    body: [
      "雨落在高窗上時，藏書室裡的時間會變得較慢。外套留在門邊，手錶擱在書頁旁；短暫離開行程的刻度，專注便有了重新安放的位置。",
      "書寫工具之所以能被長久使用，往往不是因為它們格外醒目。一本能平整攤開的筆記本、一支重量安定的筆、一只替零碎物件保留秩序的木盤，都以很小的方式減少干擾。日復一日，它們才形成書桌的性格。",
      "窗外漸亮時，不必急著完成整頁。留下日期、幾行觀察，或下一個月想記得的事，已經足夠。被保存的從來不只是文字，而是當時願意停下來的自己。",
    ],
    image: "/images/editorial/notes-kept-after-rain.webp",
    imageAlt:
      "雨後藏書室窗邊的木桌，一雙手正在筆記本上書寫，旁邊放著腕錶",
    readingTime: "閱讀約 3 分鐘",
    href: "/journal/notes-kept-after-rain",
  },
  {
    id: "journal-a-table-made-for-time",
    slug: "a-table-made-for-time",
    collectionId: "dinner-at-the-long-table",
    title: "A Table Made for Time",
    titleZh: "為時間而設的長桌",
    excerpt:
      "款待不是把桌面填滿，而是讓每位來客都有一處被好好照顧的位置。",
    body: [
      "晚餐開始以前，長桌上仍有一半空著。玻璃杯彼此保持距離，木托盤承接剛切好的麵包，燭光落在沒有刻意拉平的織物上。完整並不等於毫無痕跡。",
      "好的款待更接近一種留心：替晚到的人留一張椅子，讓香氣不蓋過食物，也讓手邊器物經得起反覆取用。當物件不要求被小心供奉，談話才能自然越過一道又一道菜。",
      "客人離席後，杯底留下淡淡水痕，房間仍保有笑聲散去後的暖意。值得傳下去的，或許不是一套從未缺角的器皿，而是人們願意再次圍坐的習慣。",
    ],
    image: "/images/editorial/a-table-made-for-time.webp",
    imageAlt:
      "燭光下的英國莊園長桌，玻璃杯、木托盤與自然垂落的織品準備迎接晚餐",
    readingTime: "閱讀約 3 分鐘",
    href: "/journal/a-table-made-for-time",
  },
] as const satisfies readonly EstateJournalEntry[];

export const primaryNavigation = [
  { label: "男裝", labelEn: "Men", href: "/men" },
  { label: "女裝", labelEn: "Women", href: "/women" },
  { label: "配件", labelEn: "Accessories", href: "/accessories" },
  { label: "居家", labelEn: "Home", href: "/home" },
  { label: "文具", labelEn: "Writing", href: "/stationery" },
  { label: "莊園篇章", labelEn: "Collections", href: "/collections" },
  { label: "Estate Journal", href: "/journal" },
] as const satisfies readonly EditorialLink[];

export const footerNavigationGroups = [
  {
    title: "選購",
    links: [
      { label: "全部商品", labelEn: "Shop All", href: "/shop" },
      { label: "男裝", labelEn: "Men", href: "/men" },
      { label: "女裝", labelEn: "Women", href: "/women" },
      { label: "配件", labelEn: "Accessories", href: "/accessories" },
      { label: "居家生活", labelEn: "Home", href: "/home" },
      { label: "文具", labelEn: "Writing", href: "/stationery" },
    ],
  },
  {
    title: "The Estate",
    links: [
      { label: "莊園篇章", labelEn: "Collections", href: "/collections" },
      { label: "Estate Journal", href: "/journal" },
      { label: "品牌故事", labelEn: "Our Story", href: "/story" },
      {
        label: "私人選品預約",
        labelEn: "Private Appointment",
        href: "/private-appointment",
      },
    ],
  },
  {
    title: "客戶服務",
    links: [
      { label: "配送與退換貨", href: "/shipping-returns" },
      { label: "隱私條款", href: "/privacy" },
      { label: "使用條款", href: "/terms" },
      { label: "收藏清單", labelEn: "Saved Pieces", href: "/wishlist" },
      { label: "購物袋", labelEn: "Bag", href: "/cart" },
    ],
  },
] as const satisfies readonly FooterNavigationGroup[];

export const brandStory = {
  eyebrow: "The Lignée Estate",
  title: "一座為當代生活而寫的莊園",
  lead:
    "The Lignée Estate 並非一段等待考證的家族史，而是 LIGNÉE 所創作的當代英倫地景：一處讓衣著、物件與日常禮節重新取得分寸的想像居所。",
  paragraphs: [
    "故事從清晨田野開始，經過午後溫室、雨後藏書室，最後抵達長桌晚餐。莊園裡的人保持匿名，因為我們關心的不是姓氏或爵位，而是人如何照料一件衣服、如何為來客留一張椅子，以及如何把時間留給值得反覆做的事。",
    "馬術、獵犬與林野活動構成這個世界的節奏，卻不成為炫耀的象徵。服裝屬於當代，物件應當被使用；自然留下的摺痕、磨痕與光澤，是生活與材質共同完成的部分。",
    "Made to Be Inherited. 不是關於擁有一段被安排好的出身，而是選擇讓什麼留得更久。LIGNÉE 以克制的輪廓、安靜的色彩與可照料的日常物件，提出一種不被季節迅速帶走的生活方式。",
  ],
  principles: [
    {
      title: "A Life in Chapters",
      titleZh: "讓一天自然成章",
      description:
        "衣著與物件依照真實生活的時刻被選擇，而不是為單一場合搭建佈景。",
    },
    {
      title: "Patina, Not Display",
      titleZh: "使用，而非供奉",
      description:
        "我們珍視時間在物件上留下的變化，也相信照料比刻意保持全新更有意義。",
    },
    {
      title: "Story with Clear Boundaries",
      titleZh: "故事與事實，各有位置",
      description:
        "莊園是虛構的品牌世界；材質、產地與製程則只會在獲得確認後，作為商品事實呈現。",
    },
  ],
  fictionNotice:
    "The Lignée Estate 為 LIGNÉE 的原創虛構世界觀，不代表可查證的英國莊園、家族譜系或企業沿革。商品規格於概念階段僅作設計方向說明。",
} as const;

export const lettersFromTheEstate = {
  eyebrow: "Letters from the Estate",
  title: "收到一封不被催促的來信",
  description:
    "關於季節衣著、莊園日常與新篇章的安靜筆記，也包含少量私人預覽。只在有值得分享的內容時寄出。",
  fieldLabel: "電子信箱",
  fieldPlaceholder: "reader@estate.invalid",
  submitLabel: "收下莊園來信",
  privacyNotice:
    "概念預覽不會傳送或保存資料。請勿輸入真實電子信箱。",
  successTitle: "Your place is kept.",
  successMessage:
    "這是展示用訂閱狀態，沒有資料被送出或保存。正式服務開放後，我們會在此說明寄送頻率與取消方式。",
} as const;

export const privateAppointment = {
  eyebrow: "Private Appointment",
  title: "把選擇留給一段完整的時間",
  introduction:
    "私人選品預約為服裝搭配、居家物件與贈禮需求保留更從容的對話。顧問會從使用場景、偏好的輪廓與預算尺度開始整理，而不是從一份必須購買的清單開始。",
  services: [
    {
      title: "Wardrobe Edit",
      titleZh: "衣櫥選品",
      description:
        "依日常工作、週末與正式場合，整理可彼此延續的服裝與配件方向。",
    },
    {
      title: "The Considered Gift",
      titleZh: "贈禮諮詢",
      description:
        "從收禮者的生活習慣出發，選擇不急於表態、卻能長久陪伴的物件。",
    },
    {
      title: "Rooms & Rituals",
      titleZh: "居家片刻",
      description:
        "為書桌、臥室與餐桌建立一致而不刻意成套的材質與使用節奏。",
    },
  ],
  courtesy:
    "所選物件可安排禮盒包裝與手寫卡片，不另計費；實際樣式與服務範圍將於正式營運前確認。",
  availability:
    "概念預覽中的預約為互動示意，不會建立真實時段或由顧問聯絡。",
  form: {
    title: "預留一段對話",
    description:
      "請以頁面提供的虛構範例體驗表單；此版本不接收真實姓名、電話、信箱或其他個人資料。",
    submitLabel: "送出展示預約",
    privacyNotice:
      "請勿輸入真實個資。所有欄位只存在目前頁面記憶體，不會傳送或保存，重新整理後即清除。",
    successTitle: "A quiet hour has been set aside.",
    successMessage:
      "展示預約已完成；沒有資料被送出，也沒有建立真實預約。",
  },
} as const;

export function getEstateCollection(
  slug: string,
): EstateCollection | undefined {
  return estateCollections.find((collection) => collection.slug === slug);
}

export function getEstateJournalEntry(
  slug: string,
): EstateJournalEntry | undefined {
  return estateJournalEntries.find((entry) => entry.slug === slug);
}
