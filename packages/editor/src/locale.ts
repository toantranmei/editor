export type BlockGroup = 'basic' | 'media' | 'advanced' | 'layout'

export interface EditorMessages {
  placeholder: string
  headingPlaceholder: (level: number) => string
  togglePlaceholder: string
  groups: Record<BlockGroup, string>
  blocks: Record<string, { title: string, description: string }>
  slash: { empty: string, results: string, recent: string, colors: string, textColor: (color: string) => string, bgColor: (color: string) => string }
  /** Handle tooltips: `<verb> <text>`, e.g. "**Drag** to move". */
  handle: { add: string, addAbove: string, drag: string, menu: string, dragVerb: string, clickVerb: string, altClickVerb: string }
  blockMenu: {
    delete: string
    duplicate: string
    turnInto: string
    color: string
    textColor: string
    backgroundColor: string
    recent: string
    search: string
    noResults: string
    moveUp: string
    moveDown: string
    copyLink: string
    linkCopied: string
    actions: string
    selected: (count: number) => string
  }
  colors: Record<string, string>
  format: { bold: string, italic: string, underline: string, strike: string, code: string, link: string, color: string, linkPlaceholder: string, removeLink: string, apply: string }
  image: {
    upload: string
    link: string
    choose: string
    dropHint: (maxMb: number) => string
    insert: string
    notImage: string
    tooLarge: (maxMb: number) => string
    invalidLink: string
    caption: string
    uploading: string
    uploadFailed: string
    align: string
    alignments: { left: string, center: string, right: string }
    captionToggle: string
    crop: string
    cropDone: string
    cropCancel: string
    cropReset: string
    zoom: string
    zoomIn: string
    zoomOut: string
    zoomReset: string
    download: string
    more: string
    replace: string
    copyLink: string
    linkCopied: string
    original: string
    delete: string
    close: string
  }
  embed: { hint: string, placeholder: string, submit: string, invalid: string }
  callout: { change: string, icon: string, background: string }
  code: { copy: string, copied: string }
  unknownBlock: string
  invalidBlock: string
  contentError: string
  toc: { empty: string, untitled: string, title: string }
  table: {
    rowMenu: string
    columnMenu: string
    headerRow: string
    headerColumn: string
    insertAbove: string
    insertBelow: string
    insertLeft: string
    insertRight: string
    duplicate: string
    moveUp: string
    moveDown: string
    moveLeft: string
    moveRight: string
    clear: string
    color: string
    deleteRow: string
    deleteColumn: string
    merge: string
    split: string
    addRow: string
    addColumn: string
  }
  math: { placeholder: string, inputPlaceholder: string, hintBlock: string, hintInline: string, missing: string }
  mermaid: { preview: string, invalid: string, missing: string }
  html: {
    title: string
    code: string
    preview: string
    upload: string
    uploadFile: string
    write: string
    expand: string
    close: string
    interact: string
    emptyHint: string
    placeholder: string
    wrongType: string
    tooLarge: (maxKb: number) => string
  }
  file: {
    upload: string
    link: string
    embed: string
    chooseFile: string
    chooseAudio: string
    chooseVideo: string
    dropHint: (maxMb: number) => string
    tooLarge: (maxMb: number) => string
    wrongType: string
    uploadFailed: string
    invalidLink: string
    uploading: string
    download: string
  }
  datePicker: {
    endDate: string
    dateFormat: string
    includeTime: string
    timeFormat: string
    hour12: string
    hour24: string
    remind: string
    clear: string
    learnReminders: string
    prevMonth: string
    nextMonth: string
    formats: Record<'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative', string>
    reminders: Record<string, string>
  }
  mention: { today: string, tomorrow: string, yesterday: string, people: string, pages: string, dates: string, empty: string, searchPlaceholder: string, noSearch: string, openPage: string, prevMonth: string, nextMonth: string }
}

export const vi: EditorMessages = {
  placeholder: 'Gõ \'/\' để chọn loại block...',
  headingPlaceholder: level => `Tiêu đề ${level}`,
  togglePlaceholder: 'Toggle',
  groups: { basic: 'Cơ bản', media: 'Media', advanced: 'Nâng cao', layout: 'Bố cục' },
  blocks: {
    paragraph: { title: 'Văn bản', description: 'Đoạn văn bản thường.' },
    heading1: { title: 'Tiêu đề 1', description: 'Tiêu đề lớn.' },
    heading2: { title: 'Tiêu đề 2', description: 'Tiêu đề vừa.' },
    heading3: { title: 'Tiêu đề 3', description: 'Tiêu đề nhỏ.' },
    heading4: { title: 'Tiêu đề 4', description: 'Tiêu đề rất nhỏ.' },
    toggleHeading1: { title: 'Toggle tiêu đề 1', description: 'Tiêu đề lớn có thể thu gọn.' },
    toggleHeading2: { title: 'Toggle tiêu đề 2', description: 'Tiêu đề vừa có thể thu gọn.' },
    toggleHeading3: { title: 'Toggle tiêu đề 3', description: 'Tiêu đề nhỏ có thể thu gọn.' },
    toc: { title: 'Mục lục', description: 'Tự tạo từ các tiêu đề.' },
    mathBlock: { title: 'Công thức', description: 'Công thức toán (LaTeX).' },
    mathInline: { title: 'Công thức trong dòng', description: 'Công thức nằm trong câu.' },
    mermaid: { title: 'Sơ đồ Mermaid', description: 'Flowchart, sequence, gantt...' },
    html: { title: 'HTML', description: 'Chạy HTML/CSS/JS tương tác trong trang.' },
    'file-file': { title: 'Tệp đính kèm', description: 'Tải lên hoặc dán link tệp.' },
    'file-audio': { title: 'Âm thanh', description: 'Tải lên hoặc dán link audio.' },
    'file-video': { title: 'Video tải lên', description: 'Tải lên hoặc dán link video.' },
    mention: { title: 'Nhắc tên / ngày', description: 'Nhắc người, trang hoặc ngày.' },
    bulletList: { title: 'Danh sách chấm', description: 'Danh sách gạch đầu dòng.' },
    orderedList: { title: 'Danh sách số', description: 'Danh sách đánh số thứ tự.' },
    taskList: { title: 'Việc cần làm', description: 'Danh sách checkbox.' },
    blockquote: { title: 'Trích dẫn', description: 'Đoạn trích dẫn.' },
    divider: { title: 'Đường kẻ', description: 'Phân cách các phần.' },
    codeBlock: { title: 'Code', description: 'Đoạn code có tô màu cú pháp.' },
    image: { title: 'Hình ảnh', description: 'Tải ảnh lên hoặc dán link.' },
    embed: { title: 'Video / Embed', description: 'Nhúng YouTube, Vimeo, web...' },
    callout: { title: 'Callout', description: 'Khối nổi bật có icon.' },
    toggle: { title: 'Toggle', description: 'Khối có thể thu gọn / mở rộng.' },
    table: { title: 'Bảng', description: 'Bảng 3×3 đơn giản.' },
    columns2: { title: '2 cột', description: 'Chia nội dung thành 2 cột.' },
    columns3: { title: '3 cột', description: 'Chia nội dung thành 3 cột.' },
    columns4: { title: '4 cột', description: 'Chia nội dung thành 4 cột.' },
  },
  slash: { empty: 'Không tìm thấy block nào', results: 'Kết quả', recent: 'Dùng gần đây', colors: 'Màu', textColor: c => `Chữ ${c.toLowerCase()}`, bgColor: c => `Nền ${c.toLowerCase()}` },
  handle: { add: 'để thêm block bên dưới', addAbove: 'để thêm bên trên', drag: 'để di chuyển', menu: 'để mở menu', dragVerb: 'Kéo', clickVerb: 'Bấm', altClickVerb: 'Alt+bấm' },
  blockMenu: {
    delete: 'Xoá',
    duplicate: 'Nhân bản',
    turnInto: 'Chuyển thành',
    color: 'Màu',
    textColor: 'Màu chữ',
    backgroundColor: 'Màu nền',
    recent: 'Dùng gần đây',
    search: 'Tìm thao tác...',
    noResults: 'Không có kết quả',
    moveUp: 'Di chuyển lên',
    moveDown: 'Di chuyển xuống',
    copyLink: 'Sao chép link tới block',
    linkCopied: 'Đã sao chép link',
    actions: 'Thao tác',
    selected: n => `${n} block`,
  },
  colors: { default: 'Mặc định', gray: 'Xám', brown: 'Nâu', orange: 'Cam', yellow: 'Vàng', green: 'Xanh lá', blue: 'Xanh dương', purple: 'Tím', pink: 'Hồng', red: 'Đỏ' },
  format: { bold: 'Đậm', italic: 'Nghiêng', underline: 'Gạch chân', strike: 'Gạch ngang', code: 'Code', link: 'Link', color: 'Màu', linkPlaceholder: 'Dán link...', removeLink: 'Bỏ link', apply: 'OK' },
  image: {
    upload: 'Tải lên',
    link: 'Dán link',
    choose: 'Chọn ảnh',
    dropHint: mb => `Hoặc kéo thả ảnh vào đây · tối đa ${mb}MB`,
    insert: 'Chèn ảnh',
    notImage: 'File không phải ảnh.',
    tooLarge: mb => `Ảnh tối đa ${mb}MB.`,
    invalidLink: 'Link ảnh không hợp lệ.',
    caption: 'Thêm chú thích...',
    uploading: 'Đang tải lên...',
    uploadFailed: 'Tải ảnh lên thất bại.',
    align: 'Căn lề',
    alignments: { left: 'Căn trái', center: 'Căn giữa', right: 'Căn phải' },
    captionToggle: 'Chú thích',
    crop: 'Cắt ảnh',
    cropDone: 'Xong',
    cropCancel: 'Huỷ',
    cropReset: 'Đặt lại',
    zoom: 'Phóng to',
    zoomIn: 'Phóng to',
    zoomOut: 'Thu nhỏ',
    zoomReset: 'Về 100%',
    download: 'Tải xuống',
    more: 'Thêm',
    replace: 'Thay ảnh',
    copyLink: 'Sao chép link ảnh',
    linkCopied: 'Đã sao chép',
    original: 'Xem ảnh gốc',
    delete: 'Xoá',
    close: 'Đóng',
  },
  embed: { hint: 'Nhúng video hoặc trang web (YouTube, Vimeo, Loom, Figma, Google Maps...)', placeholder: 'Dán link vào đây...', submit: 'Nhúng', invalid: 'Link không hợp lệ (cần http/https).' },
  callout: { change: 'Đổi icon / màu', icon: 'Icon', background: 'Màu nền' },
  code: { copy: 'Copy', copied: 'Đã copy' },
  unknownBlock: 'Block không được hỗ trợ',
  invalidBlock: 'Block bị lỗi dữ liệu (đã giữ nguyên)',
  contentError: 'Không đọc được nội dung. Editor đang ở chế độ chỉ xem để không ghi đè dữ liệu đã lưu.',
  toc: { empty: 'Thêm tiêu đề để tạo mục lục.', untitled: 'Không có tiêu đề', title: 'Mục lục' },
  table: {
    rowMenu: 'Bấm để mở menu hàng',
    columnMenu: 'Bấm để mở menu cột',
    headerRow: 'Hàng tiêu đề',
    headerColumn: 'Cột tiêu đề',
    insertAbove: 'Chèn hàng phía trên',
    insertBelow: 'Chèn hàng phía dưới',
    insertLeft: 'Chèn cột bên trái',
    insertRight: 'Chèn cột bên phải',
    duplicate: 'Nhân bản',
    moveUp: 'Di chuyển lên',
    moveDown: 'Di chuyển xuống',
    moveLeft: 'Di chuyển sang trái',
    moveRight: 'Di chuyển sang phải',
    clear: 'Xoá nội dung',
    color: 'Màu nền',
    deleteRow: 'Xoá hàng',
    deleteColumn: 'Xoá cột',
    merge: 'Gộp ô',
    split: 'Tách ô',
    addRow: 'Thêm hàng',
    addColumn: 'Thêm cột',
  },
  math: {
    placeholder: 'Thêm công thức',
    inputPlaceholder: 'Nhập LaTeX, ví dụ E = mc^2',
    hintBlock: '⌘ + Enter để xong',
    hintInline: 'Enter để xong',
    missing: 'Cần cài thư viện "katex" để hiển thị công thức.',
  },
  mermaid: { preview: 'Xem trước sơ đồ', invalid: 'Cú pháp Mermaid chưa đúng.', missing: 'Cần cài thư viện "mermaid" để hiển thị sơ đồ.' },
  html: {
    title: 'HTML',
    code: 'Code',
    preview: 'Xem trước',
    upload: 'Tải lên file .html',
    uploadFile: 'Tải lên file',
    write: 'Viết code',
    expand: 'Phóng to',
    close: 'Đóng',
    interact: 'Tương tác',
    emptyHint: 'Chạy HTML, CSS và JavaScript ngay trong trang (máy tính, quiz, sơ đồ, prototype...).',
    placeholder: '<!-- Viết hoặc dán code HTML vào đây -->',
    wrongType: 'Chỉ nhận file .html.',
    tooLarge: kb => `File tối đa ${kb >= 1024 ? `${Math.round(kb / 1024)}MB` : `${kb}KB`}.`,
  },
  file: {
    upload: 'Tải lên',
    link: 'Dán link',
    embed: 'Chèn',
    chooseFile: 'Chọn tệp',
    chooseAudio: 'Chọn tệp âm thanh',
    chooseVideo: 'Chọn video',
    dropHint: mb => `Hoặc kéo thả vào đây · tối đa ${mb}MB`,
    tooLarge: mb => `Tệp tối đa ${mb}MB.`,
    wrongType: 'Định dạng tệp không phù hợp.',
    uploadFailed: 'Tải lên thất bại.',
    invalidLink: 'Link không hợp lệ.',
    uploading: 'Đang tải lên...',
    download: 'Tải xuống',
  },
  datePicker: {
    endDate: 'Ngày kết thúc',
    dateFormat: 'Định dạng ngày',
    includeTime: 'Bao gồm giờ',
    timeFormat: 'Định dạng giờ',
    hour12: '12 giờ',
    hour24: '24 giờ',
    remind: 'Nhắc nhở',
    clear: 'Xoá',
    learnReminders: 'Tìm hiểu về nhắc nhở',
    prevMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
    formats: { full: 'Ngày đầy đủ', short: 'Ngày rút gọn', mdy: 'Tháng/Ngày/Năm', dmy: 'Ngày/Tháng/Năm', ymd: 'Năm/Tháng/Ngày', relative: 'Tương đối' },
    reminders: {
      'none': 'Không',
      'day': 'Trong ngày (9:00)',
      'at': 'Đúng giờ',
      '5m': 'Trước 5 phút',
      '10m': 'Trước 10 phút',
      '15m': 'Trước 15 phút',
      '30m': 'Trước 30 phút',
      '1h': 'Trước 1 giờ',
      '2h': 'Trước 2 giờ',
      '1d': 'Trước 1 ngày',
      '2d': 'Trước 2 ngày',
      '1w': 'Trước 1 tuần',
    },
  },
  mention: { today: 'Hôm nay', tomorrow: 'Ngày mai', yesterday: 'Hôm qua', people: 'Người', pages: 'Trang', dates: 'Ngày', empty: 'Không tìm thấy', searchPlaceholder: 'Tìm người hoặc trang...', noSearch: 'Chưa cấu hình tìm kiếm (mention.configure({ search }))', openPage: 'Mở trang', prevMonth: 'Tháng trước', nextMonth: 'Tháng sau' },
}

export const en: EditorMessages = {
  placeholder: 'Type \'/\' for commands...',
  headingPlaceholder: level => `Heading ${level}`,
  togglePlaceholder: 'Toggle',
  groups: { basic: 'Basic blocks', media: 'Media', advanced: 'Advanced', layout: 'Layout' },
  blocks: {
    paragraph: { title: 'Text', description: 'Plain text.' },
    heading1: { title: 'Heading 1', description: 'Big section heading.' },
    heading2: { title: 'Heading 2', description: 'Medium section heading.' },
    heading3: { title: 'Heading 3', description: 'Small section heading.' },
    heading4: { title: 'Heading 4', description: 'Smallest heading.' },
    toggleHeading1: { title: 'Toggle heading 1', description: 'Collapsible big heading.' },
    toggleHeading2: { title: 'Toggle heading 2', description: 'Collapsible medium heading.' },
    toggleHeading3: { title: 'Toggle heading 3', description: 'Collapsible small heading.' },
    toc: { title: 'Table of contents', description: 'Built from your headings.' },
    mathBlock: { title: 'Block equation', description: 'Math with LaTeX.' },
    mathInline: { title: 'Inline equation', description: 'Math inside a sentence.' },
    mermaid: { title: 'Mermaid diagram', description: 'Flowchart, sequence, gantt...' },
    html: { title: 'HTML', description: 'Interactive HTML/CSS/JS on the page.' },
    'file-file': { title: 'File', description: 'Upload or link a file.' },
    'file-audio': { title: 'Audio', description: 'Upload or link audio.' },
    'file-video': { title: 'Video upload', description: 'Upload or link a video.' },
    mention: { title: 'Mention', description: 'Mention a person, page or date.' },
    bulletList: { title: 'Bulleted list', description: 'A simple bulleted list.' },
    orderedList: { title: 'Numbered list', description: 'A list with numbering.' },
    taskList: { title: 'To-do list', description: 'Track tasks with checkboxes.' },
    blockquote: { title: 'Quote', description: 'Capture a quote.' },
    divider: { title: 'Divider', description: 'Visually divide blocks.' },
    codeBlock: { title: 'Code', description: 'Code with syntax highlighting.' },
    image: { title: 'Image', description: 'Upload or embed with a link.' },
    embed: { title: 'Video / Embed', description: 'YouTube, Vimeo, any web page...' },
    callout: { title: 'Callout', description: 'Make writing stand out.' },
    toggle: { title: 'Toggle', description: 'Hide content inside a toggle.' },
    table: { title: 'Table', description: 'A simple 3×3 table.' },
    columns2: { title: '2 columns', description: 'Split content into 2 columns.' },
    columns3: { title: '3 columns', description: 'Split content into 3 columns.' },
    columns4: { title: '4 columns', description: 'Split content into 4 columns.' },
  },
  slash: { empty: 'No results', results: 'Results', recent: 'Recently used', colors: 'Colors', textColor: c => `${c} text`, bgColor: c => `${c} background` },
  handle: { add: 'to add below', addAbove: 'to add above', drag: 'to move', menu: 'to open menu', dragVerb: 'Drag', clickVerb: 'Click', altClickVerb: 'Alt-click' },
  blockMenu: {
    delete: 'Delete',
    duplicate: 'Duplicate',
    turnInto: 'Turn into',
    color: 'Color',
    textColor: 'Text color',
    backgroundColor: 'Background color',
    recent: 'Last used',
    search: 'Search actions...',
    noResults: 'No results',
    moveUp: 'Move up',
    moveDown: 'Move down',
    copyLink: 'Copy link to block',
    linkCopied: 'Link copied',
    actions: 'Actions',
    selected: n => `${n} blocks`,
  },
  colors: { default: 'Default', gray: 'Gray', brown: 'Brown', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink', red: 'Red' },
  format: { bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', code: 'Code', link: 'Link', color: 'Color', linkPlaceholder: 'Paste link...', removeLink: 'Remove link', apply: 'OK' },
  image: {
    upload: 'Upload',
    link: 'Embed link',
    choose: 'Choose an image',
    dropHint: mb => `Or drop an image here · max ${mb}MB`,
    insert: 'Embed image',
    notImage: 'This file is not an image.',
    tooLarge: mb => `Images can be at most ${mb}MB.`,
    invalidLink: 'Invalid image link.',
    caption: 'Write a caption...',
    uploading: 'Uploading...',
    uploadFailed: 'Upload failed.',
    align: 'Align',
    alignments: { left: 'Align left', center: 'Align center', right: 'Align right' },
    captionToggle: 'Caption',
    crop: 'Crop',
    cropDone: 'Done',
    cropCancel: 'Cancel',
    cropReset: 'Reset',
    zoom: 'View full size',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Reset to 100%',
    download: 'Download',
    more: 'More',
    replace: 'Replace',
    copyLink: 'Copy image link',
    linkCopied: 'Copied',
    original: 'View original',
    delete: 'Delete',
    close: 'Close',
  },
  embed: { hint: 'Embed a video or web page (YouTube, Vimeo, Loom, Figma, Google Maps...)', placeholder: 'Paste a link...', submit: 'Embed', invalid: 'Invalid link (http/https only).' },
  callout: { change: 'Change icon / color', icon: 'Icon', background: 'Background' },
  code: { copy: 'Copy', copied: 'Copied' },
  unknownBlock: 'Unsupported block',
  invalidBlock: 'Invalid block data (kept as is)',
  contentError: 'This content can\'t be read. The editor is read-only so saved data isn\'t overwritten.',
  toc: { empty: 'Add headings to build a table of contents.', untitled: 'Untitled', title: 'Table of contents' },
  table: {
    rowMenu: 'Click to open the row menu',
    columnMenu: 'Click to open the column menu',
    headerRow: 'Header row',
    headerColumn: 'Header column',
    insertAbove: 'Insert above',
    insertBelow: 'Insert below',
    insertLeft: 'Insert left',
    insertRight: 'Insert right',
    duplicate: 'Duplicate',
    moveUp: 'Move up',
    moveDown: 'Move down',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    clear: 'Clear contents',
    color: 'Background color',
    deleteRow: 'Delete row',
    deleteColumn: 'Delete column',
    merge: 'Merge cells',
    split: 'Split cell',
    addRow: 'Add a row',
    addColumn: 'Add a column',
  },
  math: {
    placeholder: 'Add an equation',
    inputPlaceholder: 'Type LaTeX, e.g. E = mc^2',
    hintBlock: '⌘ + Enter to finish',
    hintInline: 'Enter to finish',
    missing: 'Install the "katex" package to render equations.',
  },
  mermaid: { preview: 'Diagram preview', invalid: 'Invalid Mermaid syntax.', missing: 'Install the "mermaid" package to render diagrams.' },
  html: {
    title: 'HTML',
    code: 'Code',
    preview: 'Preview',
    upload: 'Upload .html file',
    uploadFile: 'Upload file',
    write: 'Write code',
    expand: 'Expand',
    close: 'Close',
    interact: 'Interact',
    emptyHint: 'Run HTML, CSS and JavaScript right on the page (calculators, quizzes, diagrams, prototypes...).',
    placeholder: '<!-- Write or paste HTML here -->',
    wrongType: 'Only .html files are supported.',
    tooLarge: kb => `Max file size is ${kb >= 1024 ? `${Math.round(kb / 1024)}MB` : `${kb}KB`}.`,
  },
  file: {
    upload: 'Upload',
    link: 'Embed link',
    embed: 'Embed',
    chooseFile: 'Choose a file',
    chooseAudio: 'Choose audio',
    chooseVideo: 'Choose a video',
    dropHint: mb => `Or drop it here · max ${mb}MB`,
    tooLarge: mb => `Files can be at most ${mb}MB.`,
    wrongType: 'Unsupported file type.',
    uploadFailed: 'Upload failed.',
    invalidLink: 'Invalid link.',
    uploading: 'Uploading...',
    download: 'Download',
  },
  datePicker: {
    endDate: 'End date',
    dateFormat: 'Date format',
    includeTime: 'Include time',
    timeFormat: 'Time format',
    hour12: '12 hour',
    hour24: '24 hour',
    remind: 'Remind',
    clear: 'Clear',
    learnReminders: 'Learn about reminders',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    formats: { full: 'Full date', short: 'Short date', mdy: 'Month/Day/Year', dmy: 'Day/Month/Year', ymd: 'Year/Month/Day', relative: 'Relative' },
    reminders: {
      'none': 'None',
      'day': 'On day of event (9:00 AM)',
      'at': 'At time of event',
      '5m': '5 minutes before',
      '10m': '10 minutes before',
      '15m': '15 minutes before',
      '30m': '30 minutes before',
      '1h': '1 hour before',
      '2h': '2 hours before',
      '1d': '1 day before',
      '2d': '2 days before',
      '1w': '1 week before',
    },
  },
  mention: { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', people: 'People', pages: 'Pages', dates: 'Dates', empty: 'No results', searchPlaceholder: 'Search people or pages...', noSearch: 'Search is not configured (mention.configure({ search }))', openPage: 'Open page', prevMonth: 'Previous month', nextMonth: 'Next month' },
}

export const locales = { vi, en }
export type LocaleName = keyof typeof locales

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
export type PartialMessages = DeepPartial<EditorMessages>

/** Merges override layers (e.g. custom blocks' strings, then app overrides) into a base locale, one level deep per section. */
export function resolveMessages(locale: LocaleName = 'vi', ...layers: (PartialMessages | undefined)[]): EditorMessages {
  const out: any = { ...(locales[locale] ?? vi) }
  for (const overrides of layers) {
    if (!overrides) continue
    for (const [key, value] of Object.entries(overrides)) {
      const current = out[key]
      out[key] = value && typeof value === 'object' && current && typeof current === 'object' ? { ...current, ...value } : value
    }
  }
  return out as EditorMessages
}
