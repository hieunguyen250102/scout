/** The rulebook, condensed to what you need at the table. */

import { motion } from 'framer-motion';

const SECTIONS: Array<{ title: string; body: (string | string[])[] }> = [
  {
    title: 'Mục tiêu',
    body: [
      'Ghép và đánh ra bộ bài mạnh hơn đối thủ để ăn điểm. Lá liền nhau thì mạnh hơn, nhưng bạn KHÔNG được xếp lại bài trên tay.',
      'Chơi đủ số vòng bằng số người chơi. Ai nhiều điểm nhất thắng.',
    ],
  },
  {
    title: 'Lá bài',
    body: [
      'Mỗi lá có 2 số ở hai đầu, ngược chiều nhau. Chỉ số ở phía bạn mới tính.',
      'Đầu mỗi vòng bạn được xoay cả nắm bài 180° một lần duy nhất — thao tác này lật mọi lá và đảo ngược thứ tự.',
    ],
  },
  {
    title: 'Lượt của bạn — chọn 1 trong 3',
    body: [
      ['Show', 'Đánh một bộ mạnh hơn bộ đang mở trên sàn.'],
      ['Scout', 'Lấy 1 lá ở hai đầu bộ đang mở, chèn vào bất kỳ đâu trên tay (được lật). Chủ bộ đó nhận 1 chip Scout = 1 điểm.'],
      ['Scout & Show', 'Scout rồi đánh luôn. Mỗi người chỉ dùng 1 lần mỗi vòng.'],
    ],
  },
  {
    title: 'Bộ hợp lệ',
    body: [
      'Các lá phải nằm LIỀN NHAU trên tay bạn.',
      'Và có số liên tiếp (3-4-5 hoặc 5-4-3) hoặc số giống nhau (7-7-7).',
    ],
  },
  {
    title: 'Bộ nào mạnh hơn?',
    body: [
      ['1. Số lá', 'Nhiều lá hơn = mạnh hơn.'],
      ['2. Kiểu bộ', 'Cùng số lá: bộ số giống nhau mạnh hơn bộ liên tiếp.'],
      ['3. Số nhỏ nhất', 'Cùng số lá và cùng kiểu: so lá nhỏ nhất, cao hơn thì thắng. Bằng nhau là không đánh được.'],
    ],
  },
  {
    title: 'Hết vòng',
    body: [
      'i. Có người đánh hết bài.',
      'ii. Sau một lần Show, tất cả những người còn lại đều không Show (chỉ Scout).',
    ],
  },
  {
    title: 'Tính điểm',
    body: [
      'Mỗi lá đã ăn được + mỗi chip Scout = 1 điểm.',
      'Trừ 1 điểm cho mỗi lá còn trên tay — trừ người kết thúc vòng theo điều kiện "ii" thì được miễn.',
      'Bộ đang mở trên sàn và chip Scout & Show không tính điểm.',
    ],
  },
  {
    title: 'Luật 2 người',
    body: [
      'Mỗi người nhận 3 chip Scout và 11 lá; 22 lá còn lại để dành cho vòng 2. Không dùng Scout & Show.',
      'Muốn Scout thì phải trả 1 chip vào giữa bàn. Hết chip thì không Scout được nữa.',
      'Scout xong bạn vẫn tiếp tục lượt của mình cho tới khi Show.',
    ],
  },
];

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-ink/88 px-3 py-8 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 24 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="panel w-full max-w-xl rounded-3xl p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="display text-2xl font-extrabold text-gold">Luật chơi SCOUT</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost !px-3 !py-1 text-sm"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="display text-sm font-bold uppercase tracking-[0.14em] text-teal">{s.title}</h3>
              <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-cream/75">
                {s.body.map((line, i) =>
                  Array.isArray(line) ? (
                    <li key={i} className="flex gap-2">
                      <span className="display shrink-0 font-bold text-gold">{line[0]}</span>
                      <span>{line[1]}</span>
                    </li>
                  ) : (
                    <li key={i}>{line}</li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-cream/35">
          SCOUT do Kei Kajino thiết kế, Oink Games xuất bản. Đây là bản dựng lại phi thương mại để học và chơi vui.
        </p>

        <button type="button" onClick={onClose} className="btn btn-gold mt-4 w-full">
          Đã rõ!
        </button>
      </motion.div>
    </motion.div>
  );
}
