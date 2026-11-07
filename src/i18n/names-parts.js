// The parts soldiers' own names are made of (cast.js, lastgate.js), English → Chinese, for src/i18n.js tname()'s part-by-part reading.
// NAME_PARTS_EAST: Chinese, Japanese, Korean, Xiongnu, Manchu and Mongol parts (written in characters), run together (王 + 大 → 王大).
// NAME_PARTS: every other part, joined with the transliteration dot (汉斯·冯·乌里); '' drops a particle.
// NAME_TITLES: ranks, titles and "of <place>", put after the name (雷耶斯 + 中士; 权兵卫 + （近江）).
// A run of words is looked up before its single words, so a pair whose given name reads differently from the same syllable as a
// surname is keyed whole: Wang Wu is 王五 (Wu the surname is 吴), Xu Ma is 徐麻子, Li Wei 李威 (Wei the Han surname is 卫).

// The Ming garrison's and the Red Turbans' given names that are surnames too: keyed with each surname they come after.
const MING_SURNAMES = { Wang: '王', Li: '李', Zhang: '张', Liu: '刘', Chen: '陈', Yang: '杨', Zhao: '赵', Huang: '黄', Zhou: '周', Wu: '吴', Qi: '戚', Luo: '罗' };
const HORSE_SURNAMES = { Li: '李', Zhang: '张', Wang: '王', Zhu: '朱', Ma: '马', Sun: '孙', Qian: '钱', Xu: '徐', Tang: '唐', Gao: '高', Shen: '沈', Yu: '俞' };
const WOKOU_SURNAMES = { Xu: '徐', Wang: '王', Lin: '林', Chen: '陈', Huang: '黄', Ye: '叶', Mao: '毛', Hong: '洪' };
const surnamePairs = (surnames, given) => Object.fromEntries(Object.entries(surnames).flatMap(([en, zh]) => Object.entries(given).map(([part, written]) => [`${en} ${part}`, `${zh}${written}`])));

export const NAME_PARTS_EAST = {
  // An android's model and serial ('H-1 Unit 523' → H-1型523), read as a designation.
  'Unit': '型',
  // Chinese surnames.
  Wang: '王', Li: '李', Zhang: '张', Liu: '刘', Chen: '陈', Yang: '杨', Zhao: '赵', Huang: '黄', Zhou: '周', Wu: '吴', Qi: '戚', Luo: '罗',
  Zhu: '朱', Ma: '马', Sun: '孙', Qian: '钱', Xu: '徐', Tang: '唐', Gao: '高', Shen: '沈', Yu: '俞', Lin: '林', Ye: '叶', Mao: '毛', Hong: '洪',
  Han: '韩', Gongsun: '公孙', Lu: '路', Cheng: '程', Su: '苏', Wei: '卫', Guo: '郭', Peng: '彭',
  // Chinese given names: the garrison's plain ones, the horsemen's, the Han riders', the pirates', the Red Turbans' nicknames.
  Da: '大', Er: '二', San: '三', Si: '四', Hu: '虎', Bao: '宝', Shun: '顺', Gui: '贵', Fu: '福', Ming: '明',
  Biao: '彪', Yong: '勇', Zhen: '振', Fei: '飞', Kai: '凯', Lei: '雷', Meng: '猛', Tai: '泰',
  Guang: '广', Qing: '青', Chong: '充', Ping: '平', Gan: '敢', Jian: '建', Bo: '博', Xiang: '襄',
  Hai: '海', Zhi: '直', Dong: '东', Lang: '郎', Shan: '山',
  Laosan: '老三', Erlang: '二郎', Xiaoliu: '小六', Dagou: '大狗', Shuanzhu: '拴柱', Tiezhu: '铁柱', Goudan: '狗蛋', Laowu: '老五',
  // The same syllable as a given name after a surname: five, six, the pirate's pockmarks, the horseman's 成 and 威.
  ...surnamePairs(MING_SURNAMES, { Wu: '五', Liu: '六' }),
  ...surnamePairs(HORSE_SURNAMES, { Cheng: '成', Wei: '威' }),
  ...surnamePairs(WOKOU_SURNAMES, { Ma: '麻子' }),
  // The two pirate captains of the 1550s, as the histories write them.
  'Wang Zhi': '汪直', 'Xu Hai': '徐海',
  // Japanese: the yakuza, the Sekigahara lords, the rōnin, the ikki's starved peasants.
  Kenji: '健二', Takeshi: '武', Daisuke: '大辅', Ryota: '亮太', Shin: '伸', Hiroshi: '浩', Kazuo: '和夫', Tetsu: '哲', Goro: '五郎', Masa: '正',
  Mori: '森', Kuroda: '黑田', Ishida: '石田', Sato: '佐藤', Ono: '小野', Fujita: '藤田', Endo: '远藤', Kanda: '神田',
  Ii: '井伊', Honda: '本多', Shimazu: '岛津', Kobayakawa: '小早川', Ōtani: '大谷', Ukita: '宇喜多', Hosokawa: '细川', Katō: '加藤', Fukushima: '福岛', Konishi: '小西', Sanada: '真田',
  Naomasa: '直政', Tadakatsu: '忠胜', Yoshihiro: '义弘', Hideaki: '秀秋', Yoshitsugu: '吉继', Hideie: '秀家', Nagamasa: '长政', Tadaoki: '忠兴', Kiyomasa: '清正', Masanori: '正则', Yukimura: '幸村', Takatora: '高虎',
  Miyamoto: '宫本', Sasaki: '佐佐木', Ito: '伊藤', Okada: '冈田', Kato: '加藤', Abe: '安倍', Ueda: '上田',
  Jubei: '十兵卫', Kojiro: '小次郎', Gonbei: '权兵卫', Sakon: '左近', Hanzo: '半藏', Tadashi: '正', Isamu: '勇', Genji: '源次',
  Tasuke: '太助', Yosaku: '与作', Hachibei: '八兵卫', Jinbei: '甚兵卫', Mohei: '茂兵卫', Sukeroku: '助六', Kyūbei: '久兵卫', Genta: '源太', Heiji: '平次', Magoroku: '孙六', Sakubei: '作兵卫',
  // The warrior monks' names (their titles are in NAME_TITLES).
  Jōmyō: '净妙', Raigō: '赖豪', Kakuban: '觉鑁', Ichirai: '一来', Shinsai: '真济', Ryōen: '良圆', Gyōnen: '凝然', Kenshin: '贤信', Dōkyō: '道镜', Shūen: '修圆',
  // Korean (a US infantryman's surname).
  Kim: '金',
  // The Xiongnu, as the Han histories wrote them.
  Yizhixie: '伊稚斜', Hunye: '浑邪', Xiutu: '休屠', Zhaoxin: '赵信', Bizhi: '比治', Tuqi: '屠耆', Huyan: '呼衍', Lan: '兰', Xubu: '须卜', Qiulin: '丘林', Gulu: '谷蠡', Hanxie: '韩邪', Wuwei: '乌维', Juqu: '且渠',
  // The banners' Manchu names, as the Qing records wrote them.
  Akdun: '阿克敦', Baturu: '巴图鲁', Mergen: '墨尔根', Hūsun: '胡逊', Erdemu: '额尔德穆', Fulu: '福禄', Sure: '苏勒', Kicebe: '齐车贝', Ilan: '伊兰', Duin: '杜音', Tulai: '图赖', Gaha: '噶哈',
  // Mongols, as the Yuan and Ming histories wrote them.
  Batu: '拔都', Bayar: '巴雅尔', Ganbold: '甘宝勒德', Temür: '帖木儿', Toghon: '脱欢', Bolad: '孛罗', Arslan: '阿尔斯兰', Esen: '也先', Sübe: '速别', Khasar: '哈撒儿', Jochi: '术赤', Mönke: '蒙哥',
};

export const NAME_PARTS = {
  // The random fighters' first names.
  Aldo: '阿尔多', Bram: '布拉姆', Cass: '卡斯', Dario: '达里奥', Emil: '埃米尔', Felix: '费利克斯', Goran: '戈兰', Hugo: '雨果', Ivo: '伊沃', Jonas: '约纳斯',
  Kenta: '健太', Luca: '卢卡', Mateo: '马特奥', Niko: '尼科', Omar: '奥马尔', Pavel: '帕维尔', Rafe: '拉夫', Silas: '赛拉斯', Tariq: '塔里克', Ugo: '乌戈',
  Ada: '埃达', Bea: '贝娅', Cleo: '克莱奥', Dana: '达娜', Eva: '伊娃', Freya: '弗蕾亚', Gia: '吉娅', Hana: '花', Ines: '伊内斯', Jade: '杰德',
  Kira: '琪拉', Lena: '莉娜', Mila: '米拉', Nora: '诺拉', Orla: '奥拉', Pia: '皮娅', Rosa: '罗莎', Sana: '纱奈', Tess: '泰丝', Vera: '薇拉',
  // A rebel's trade after his name ("Aldo the Miller"): what he does, not a surname.
  'the Miller': '磨坊主', 'the Smith': '铁匠', 'the Thatcher': '苫房匠', 'the Carter': '车夫', 'the Cooper': '箍桶匠', 'the Tanner': '皮匠', 'the Fletcher': '箭匠', 'the Reeve': '庄头',
  // The starved peasants of 1381 (their bynames read as surnames, as they had become).
  Wat: '瓦特', Hob: '霍布', Jack: '杰克', Tom: '汤姆', Will: '威尔', Hal: '哈尔', Ned: '内德', Dick: '迪克', Piers: '皮尔斯', Roger: '罗杰',
  Simkin: '西姆金', Gib: '吉布', Jankin: '扬金', Hodge: '霍奇', Col: '科尔', Adam: '亚当',
  Thatcher: '撒切尔', Reaper: '里珀', Ploughman: '普劳曼', Shepherd: '谢泼德', Hayward: '海沃德', Gleaner: '格里纳', Carter: '卡特', Thresher: '思雷舍',
  Ditcher: '迪切尔', Lean: '利恩', Crust: '克拉斯特', Hollow: '霍洛',
  // Police and infantry surnames.
  Reyes: '雷耶斯', Cole: '科尔', Novak: '诺瓦克', Burke: '伯克', Ortiz: '奥尔蒂斯', Hale: '黑尔', Kowalski: '科瓦尔斯基', Price: '普赖斯', Walsh: '沃尔什', Okafor: '奥卡福',
  Herrera: '埃雷拉', Miller: '米勒', Johnson: '约翰逊', Nguyen: '阮', Davis: '戴维斯', Garcia: '加西亚', Wright: '赖特', Thompson: '汤普森', Jackson: '杰克逊', Lopez: '洛佩斯',
  // The Dutch of Zeelandia and the Spaniards of the conquest.
  Jan: '扬', Pieter: '彼得', Hendrik: '亨德里克', Willem: '威廉', Cornelis: '科内利斯', Thomas: '托马斯', Jacob: '雅各布', Dirk: '德克',
  Pedel: '佩德尔', Coyett: '科耶特', 'de Vries': '德·弗里斯', Jansen: '扬森', 'van Dam': '范·达姆', Bakker: '巴克', Visser: '菲瑟', 'de Graaf': '德·格拉夫',
  Pedro: '佩德罗', Gonzalo: '贡萨洛', Juan: '胡安', Diego: '迭戈', Alonso: '阿隆索', Andrés: '安德烈斯', Francisco: '弗朗西斯科', Hernán: '埃尔南', Rodrigo: '罗德里戈', Martín: '马丁',
  'de Alvarado': '德·阿尔瓦拉多', 'de Sandoval': '德·桑多瓦尔', 'de Olid': '德·奥利德', Díaz: '迪亚斯', 'de Ordaz': '德·奥尔达斯', 'de Ávila': '德·阿维拉',
  'de Tapia': '德·塔皮亚', Velázquez: '贝拉斯克斯', 'de Lugo': '德·卢戈', Núñez: '努涅斯',
  // The Mexica (their city in NAME_TITLES) and the Inca.
  Cuauhtli: '夸乌特利', Ocelotl: '奥塞洛特尔', Mazatl: '马萨特尔', Tochtli: '托奇特利', Yaotl: '亚奥特尔', Tecuani: '特夸尼', Huitzil: '维齐尔', Matlal: '马特拉尔', Coaxoch: '科阿肖奇', Tenoch: '特诺奇',
  Waman: '瓦曼', Kusi: '库西', Titu: '蒂图', Amaru: '阿马鲁', Rumi: '鲁米', Wayna: '瓦伊纳', Sinchi: '辛奇', Kuntur: '昆图尔', Puma: '普马', Illapa: '伊利亚帕', Atoq: '阿托克', Wari: '瓦里',
  Yupanki: '尤潘基', Kapaq: '卡帕克', Rimachi: '里马奇', Paukar: '保卡尔', Sullka: '苏利卡', Tupaq: '图帕克', Maywa: '迈瓦', Chalco: '查尔科', Quispe: '基斯佩', Mayta: '迈塔', Wallpa: '瓦利帕', Rawa: '拉瓦',
  // The Knights of St John and their sergeants.
  Jean: '让', Gabriele: '加布里埃莱', Antoine: '安托万', Pierre: '皮埃尔', Andrea: '安德烈亚', Nicholas: '尼古拉斯', Louis: '路易',
  'de Lorgue': '德·洛尔格', Tadini: '塔迪尼', 'de Bidoux': '德·比杜', 'de Barbaran': '德·巴尔巴朗', Docwra: '多克拉', 'de Grolée': '德·格罗莱', Martinengo: '马丁嫩戈', Hussey: '赫西', 'de Toledo': '德·托莱多', 'de Morel': '德·莫雷尔',
  // The Ottomans (a Janissary officer's ağa after his name, as Ottoman usage has it).
  Mehmed: '穆罕默德', Ahmed: '艾哈迈德', Mustafa: '穆斯塔法', Hasan: '哈桑', Hüseyin: '侯赛因', Ali: '阿里', Yusuf: '优素福', İbrahim: '易卜拉欣', Süleyman: '苏莱曼', Osman: '奥斯曼', Davud: '达武德', İskender: '伊斯坎德尔',
  Ağa: '阿迦',
  // Rome: the praenomina as the Chinese histories write them, and the auxiliary riders' names.
  Gaius: '盖乌斯', Lucius: '卢基乌斯', Quintus: '昆图斯', Marcus: '马库斯', Titus: '提图斯', Aulus: '奥卢斯', Publius: '普布利乌斯', Gnaeus: '格奈乌斯', Sextus: '塞克斯图斯',
  'Julius Vindex': '尤利乌斯·文德克斯', 'Flavius Sabinus': '弗拉维乌斯·萨比努斯', 'Ulpius Atto': '乌尔皮乌斯·阿托', 'Claudius Bato': '克劳狄乌斯·巴托', 'Valerius Dacus': '瓦莱里乌斯·达库斯', 'Aelius Verax': '埃利乌斯·维拉克斯',
  Octavius: '屋大维', Petronius: '佩特罗尼乌斯', Vargunteius: '瓦尔贡泰乌斯', Censorinus: '肯索里努斯', Ignatius: '伊格纳提乌斯', Cassius: '卡西乌斯', Megabacchus: '梅加巴库斯', Coponius: '科波尼乌斯', Egnatius: '埃格纳提乌斯', Roscius: '罗斯基乌斯',
  Flavius: '弗拉维乌斯', Aurelius: '奥勒留', Valerius: '瓦莱里乌斯', Julius: '尤利乌斯', Claudius: '克劳狄乌斯',
  Maximus: '马克西穆斯', Severus: '塞维鲁', Victor: '维克托', Ursus: '乌尔苏斯', Dagalaifus: '达加莱弗斯', Bonitus: '博尼图斯', Sabinianus: '萨比尼亚努斯', Gaudentius: '高登提乌斯', Iovinus: '约维努斯', Merobaudes: '梅罗鲍德斯',
  // English knights and archers.
  'de Beauchamp': '德·博尚', 'de Courtenay': '德·考特尼', 'de Mowbray': '德·莫布雷', Montagu: '蒙塔古', 'de Vere': '德·维尔', Fitzalan: '菲查伦', Percy: '珀西', Neville: '内维尔', 'de Clifford': '德·克利福德', Holland: '霍兰',
  John: '约翰', William: '威廉', Hugh: '休', Robert: '罗伯特', Richard: '理查', Ralph: '拉尔夫', Guy: '盖伊', Henry: '亨利', Walter: '沃尔特', Simon: '西蒙', Rob: '罗布',
  Archer: '阿彻', Baker: '贝克', Cotton: '科顿', Fowler: '福勒', Mason: '梅森', Ward: '沃德', Turner: '特纳', Webb: '韦布',
  Fletcher: '弗莱彻', Bowyer: '鲍耶', Wode: '伍德', Lyttle: '利特尔', Smyth: '史密斯', Gamage: '甘米奇',
  // The Welsh archers: "son of", as Chinese writes Welsh names (格鲁菲兹·阿普·卢埃林).
  Dafydd: '戴维兹', Hywel: '休厄尔', Ieuan: '耶万', Gruffydd: '格鲁菲兹', Rhys: '里斯', Madog: '马多格', Owain: '欧文', Llywelyn: '卢埃林', Gwilym: '格威利姆', ap: '阿普',
  // Huns, Goths, Gauls and Parthians, as the Chinese histories of Rome and Iran write them.
  Bleda: '布列达', Ellac: '埃拉克', Dengizich: '邓吉兹克', Ernak: '埃尔纳克', Edeko: '埃德科', Onegesius: '奥涅格修斯', Berik: '贝里克', Eskam: '埃斯卡姆', Kursik: '库尔西克', Basik: '巴西克', Atakam: '阿塔卡姆', Uldin: '乌尔丁', Charaton: '卡拉顿', Oebarsius: '奥巴修斯',
  Thorismund: '托里斯蒙德', Theoderic: '狄奥多里克', Frideric: '弗里德里克', Euric: '尤里克', Athaulf: '阿陶尔夫', Wallia: '瓦利亚', Sigeric: '西格里克', Fritigern: '弗里提根', Athanaric: '阿塔纳里克', Wittigis: '维蒂吉斯', Gunthamund: '贡塔蒙德', Hildebrand: '希尔德布兰德', Wulfila: '乌尔菲拉', Sigismer: '西吉斯默',
  Vercassivellaunus: '韦尔卡西维劳努斯', Litaviccus: '利塔维库斯', Commius: '康缪斯', Dumnorix: '杜姆诺里克斯', Cingetorix: '辛格托里克斯', Epasnactus: '埃帕斯纳克图斯', Andecombogius: '安德孔博吉乌斯', Viridomarus: '维里多马鲁斯', Eporedorix: '埃波雷多里克斯', Cotuatus: '科图阿图斯',
  Silaces: '西拉凯斯', Arsaces: '阿尔沙克', Pacorus: '帕科鲁斯', Mithridates: '米特拉达梯', Vardanes: '瓦尔达尼斯', Gotarzes: '戈塔尔泽斯', Phraates: '弗拉特斯', Orodes: '奥罗德斯', Vologases: '沃洛加西斯', Artabanus: '阿尔塔巴努斯', Osaces: '奥萨凯斯', Sinnaces: '辛纳凯斯', Abdagases: '阿布达加西斯', Monaeses: '莫纳西斯',
  // The French men-at-arms of 1415 and the Gascon foot.
  Guillaume: '纪尧姆', Charles: '夏尔', Jacques: '雅克', Philippe: '菲利普', Raoul: '拉乌尔',
  'de Croÿ': '德·克罗伊', "d'Albret": '达尔布雷', 'de Rambures': '德·朗布尔', 'de Bournonville': '德·布尔农维尔', 'de Montmorency': '德·蒙莫朗西', 'de Bacqueville': '德·巴克维尔', 'de Hangest': '德·昂热斯特', "d'Aumont": '多蒙', 'de Lannoy': '德·拉努瓦', 'de Saveuse': '德·萨沃斯',
  Arnaud: '阿尔诺', Bernard: '贝尔纳', Guilhem: '纪廉', Peyre: '佩尔', Ramon: '拉蒙', Bertrand: '贝特朗', Sans: '桑斯', Joan: '茹安',
  'de Lescun': '德·莱斯屈恩', Barrère: '巴雷尔', Lafitte: '拉菲特', Cazaux: '卡佐', Labat: '拉巴', Pujol: '普若尔', Darrigrand: '达里格朗', Lacoste: '拉科斯特',
  // The Swiss and the landsknechts.
  Hans: '汉斯', Ueli: '乌埃利', Heini: '海尼', Rudolf: '鲁道夫', Jörg: '约尔格', Kaspar: '卡斯帕', Peter: '彼得', Werner: '维尔纳',
  'von Uri': '冯·乌里', Zurbriggen: '楚尔布里根', Ammann: '阿曼', Kälin: '凯林', Stauffacher: '施陶法赫', Imhof: '因霍夫', Schwarzmurer: '施瓦茨穆雷尔', Winkelried: '温克尔里德',
  Jakob: '雅各布', Lienhard: '林哈德', Wolf: '沃尔夫', Michel: '米歇尔', Konrad: '康拉德', Sebastian: '塞巴斯蒂安', Ulrich: '乌尔里希',
  Schertlin: '舍特林', Frundsberg: '弗伦茨贝格', Weber: '韦伯', Kessler: '凯斯勒', Gruber: '格鲁伯', Bauer: '鲍尔', Vogt: '福格特', Raidt: '赖特',
};

export const NAME_TITLES = {
  // Police and the army.
  Officer: '警员', 'Sgt.': '中士', 'Cpl.': '下士', 'Pvt.': '列兵', PFC: '一等兵', 'Spc.': '专业军士',
  // Lords and knights, the Order of St John, the French.
  Sir: '爵士', Lord: '勋爵', Fra: '骑士', Brother: '修士', Sergeant: '军士', Messire: '大人', Sire: '老爷',
  // Janissary ranks after the name.
  Çavuş: '传令官', Bölükbaşı: '队长',
  // The warrior monks' titles.
  Hōshi: '法师', Ajari: '阿阇梨', Bō: '坊', Hōin: '法印', Risshi: '律师',
  // Where a Mexica warrior and a starved Japanese peasant come from (in brackets after the name).
  'of Tlatelolco': '（特拉特洛尔科）', 'of Tenochtitlan': '（特诺奇蒂特兰）', 'of Texcoco': '（特斯科科）', 'of Tlacopan': '（特拉科潘）', 'of Coyoacan': '（科约阿坎）',
  'of Ōmi': '（近江）', 'of Kaga': '（加贺）', 'of Yamashiro': '（山城）', 'of Mino': '（美浓）', 'of Owari': '（尾张）', 'of Settsu': '（摄津）', 'of Kawachi': '（河内）', 'of Iga': '（伊贺）',
};
