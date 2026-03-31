interface LetterMeaning {
  letter: string;
  word: string;
  description: string;
}

const joyaMeanings: LetterMeaning[] = [
  {
    letter: "J",
    word: "JOYFUL",
    description: "As our name suggests, our joyful team is always happy to assist with your medical supply requirements.",
  },
  {
    letter: "O",
    word: "OBSERVANT",
    description: "We are observant to your medical needs & keep up with the latest medical supplies available.",
  },
  {
    letter: "Y",
    word: "YOU",
    description: "We’re here to assist you & find the solutions for your requirements.",
  },
  {
    letter: "A",
    word: "ACCESSIBLE",
    description: "Our medical supplies are easily accessible throughout Australia.",
  },
];

export default function JOYAMeaningSection() {
  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-50">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            The Meaning of <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-blue-600">JOYA</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {joyaMeanings.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 text-white text-4xl font-bold mb-4">
                  {item.letter}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{item.word}</h3>
              </div>
              <p className="text-gray-600 text-center leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

