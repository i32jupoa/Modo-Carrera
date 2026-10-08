export type AcademyNamePool = { first: readonly string[]; last: readonly string[] };

/**
 * Nombres de cantera por nacionalidad.
 *
 * Las claves usan los nombres que devuelve ClubStrategy (inglés) y los que
 * aparecen en el dataset del juego (español). Así la procedencia del club no
 * acaba cayendo siempre en el mismo pool por una traducción perdida.
 */
export const COUNTRY_NAMES: Record<string, AcademyNamePool> = {
  Spain: {
    first: ["Alejandro", "Álvaro", "Adrián", "Álex", "Ander", "Bruno", "Carlos", "Dani", "Diego", "Eric", "Gonzalo", "Hugo", "Iker", "Iván", "Javier", "Joel", "Leo", "Lucas", "Mario", "Martín", "Mateo", "Nicolás", "Pablo", "Sergio", "Unai", "Víctor", "Yeray", "Ángel", "Marcos", "Rodrigo", "Gael", "Pol", "Samu", "Rafa", "Héctor"],
    last: ["García", "Martínez", "Sánchez", "López", "Fernández", "Gómez", "Díaz", "Navarro", "Moreno", "Ruiz", "Torres", "Vázquez", "Ramos", "Gil", "Serrano", "Blanco", "Molina", "Suárez", "Ortega", "Delgado", "Castro", "Ortiz", "Rubio", "Marín", "Sanz", "Iglesias", "Núñez", "Vidal", "Cabrera", "Méndez", "Prieto", "Aguilar", "Rey", "Pascual", "Santana"],
  },
  England: {
    first: ["Arthur", "Alfie", "Archie", "Ben", "Benjamin", "Callum", "Charlie", "Daniel", "Elliot", "Ethan", "Freddie", "George", "Harry", "Harvey", "Henry", "Jack", "Jacob", "James", "Jamie", "Joshua", "Leo", "Liam", "Mason", "Noah", "Oliver", "Oscar", "Reuben", "Samuel", "Theo", "Thomas", "Toby", "William", "Louis", "Harrison", "Finley"],
    last: ["Smith", "Jones", "Brown", "Taylor", "Wilson", "Davies", "Evans", "Thomas", "Roberts", "Walker", "White", "Hall", "Clarke", "Harris", "Lewis", "Young", "Allen", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Turner", "Phillips", "Campbell", "Parker", "Edwards", "Collins", "Stewart", "Morris", "Cooper"],
  },
  France: {
    first: ["Adam", "Antoine", "Arthur", "Baptiste", "Enzo", "Ethan", "Evan", "Gabriel", "Hugo", "Jules", "Léo", "Lucas", "Louis", "Maël", "Mathis", "Nathan", "Noah", "Raphaël", "Rayan", "Sacha", "Théo", "Tom", "Valentin", "Yanis", "Nolan", "Malo", "Axel", "Kylian", "Eliott", "Maxime", "Paul", "Quentin", "Simon", "Arthur", "Noé"],
    last: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefèvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Lefebvre", "Mercier", "Dupont", "Lambert", "Bonnet", "François", "Martinez", "Legrand", "Garnier", "Faure", "Rousseau", "Blanc"],
  },
  Germany: {
    first: ["Anton", "Ben", "Emil", "Felix", "Finn", "Florian", "Jonas", "Julian", "Karl", "Leon", "Lennard", "Liam", "Luca", "Max", "Moritz", "Noah", "Niklas", "Paul", "Philipp", "Simon", "Tim", "Tobias", "Tom", "Valentin", "Jan", "Maximilian", "Oskar", "Louis", "Mats", "Jannik", "David", "Henrik", "Nico", "Fabian", "Konstantin"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Schmitz", "Krause", "Meier", "Lehmann", "Huber", "Maier", "Herrmann", "Kaiser", "Fuchs"],
  },
  Italy: {
    first: ["Alessandro", "Andrea", "Antonio", "Davide", "Edoardo", "Emanuele", "Federico", "Filippo", "Francesco", "Gabriele", "Giovanni", "Leonardo", "Lorenzo", "Luca", "Marco", "Matteo", "Mattia", "Niccolò", "Paolo", "Riccardo", "Simone", "Tommaso", "Valerio", "Alberto", "Daniele", "Diego", "Elia", "Michele", "Samuele", "Christian", "Jacopo", "Pietro", "Vincenzo", "Stefano", "Fabio"],
    last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo", "Gentile", "Martinelli", "Vitale", "Serra"],
  },
  Portugal: {
    first: ["Afonso", "André", "António", "Bernardo", "Diogo", "Duarte", "Francisco", "Gonçalo", "Gustavo", "João", "José", "Leonardo", "Martim", "Miguel", "Nuno", "Pedro", "Rafael", "Rodrigo", "Rúben", "Tomás", "Tiago", "Vasco", "Simão", "Guilherme", "Henrique", "Filipe", "Ricardo", "Bruno", "David", "Eduardo"],
    last: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gomes", "Carvalho", "Ribeiro", "Lopes", "Teixeira", "Pinto", "Alves", "Monteiro", "Correia", "Mendes", "Nunes", "Soares", "Vieira", "Antunes", "Fonseca", "Coelho", "Cardoso", "Marques", "Ramos", "Neves"],
  },
  Netherlands: {
    first: ["Daan", "David", "Finn", "Jesse", "Lars", "Luuk", "Milan", "Noud", "Sem", "Stijn", "Teun", "Thijs", "Ties", "Timo", "Wout", "Bram", "Cas", "Dylan", "Jens", "Joep", "Kai", "Koen", "Mats", "Mees", "Rens", "Sven", "Youri", "Lenn", "Ruben", "Mick"],
    last: ["de Jong", "Jansen", "de Vries", "van Dijk", "Bakker", "Visser", "Smit", "Meijer", "Bos", "Mulder", "de Boer", "Kuipers", "van der Meer", "Dekker", "Prins", "Blom", "Hendriks", "Vermeulen", "Koster", "van den Berg", "Vos", "van Leeuwen", "van Beek", "Dijkstra", "van der Linden", "Jacobs", "Willems", "Smeets", "van Dam", "Schouten"],
  },
  "United States": {
    first: ["Aiden", "Alex", "Andrew", "Asher", "Cameron", "Carter", "Cooper", "Eli", "Ethan", "Grayson", "Henry", "Hudson", "Jack", "James", "Jayden", "Liam", "Logan", "Lucas", "Mason", "Michael", "Noah", "Owen", "Parker", "Ryan", "Wyatt", "Caleb", "Connor", "Dylan", "Evan", "Jaxon"],
    last: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Moore", "Anderson", "Taylor", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright"],
  },
  Argentina: {
    first: ["Agustín", "Benjamín", "Bruno", "Facundo", "Franco", "Gabriel", "Gonzalo", "Joaquín", "Lautaro", "Leandro", "Lisandro", "Matías", "Máximo", "Nicolás", "Ramiro", "Santiago", "Thiago", "Valentín", "Tomás", "Federico", "Ezequiel", "Alan", "Emiliano", "Ivo", "Nahuel", "Luciano", "Francesco", "Bautista", "Tiziano", "Jeremías"],
    last: ["González", "Rodríguez", "Pérez", "Gómez", "Fernández", "López", "Díaz", "Martínez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Acosta", "Gutiérrez", "Medina", "Herrera", "Suárez", "Aguirre", "Pereyra", "Molina", "Castro", "Ortiz", "Silva", "Rojas", "Benítez", "Vega", "Navarro", "Cabrera", "Domínguez"],
  },
  Brazil: {
    first: ["Caio", "Davi", "Enzo", "Felipe", "Gabriel", "Guilherme", "Gustavo", "João", "Leonardo", "Lucas", "Matheus", "Miguel", "Murilo", "Pedro", "Rafael", "Samuel", "Thiago", "Vinícius", "Yago", "Arthur", "Bruno", "Danilo", "Diego", "Eduardo", "Henrique", "Igor", "João Pedro", "Luiz", "Renan", "Vitor"],
    last: ["Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Rodrigues", "Almeida", "Nascimento", "Lima", "Carvalho", "Ferreira", "Gomes", "Martins", "Barbosa", "Ribeiro", "Alves", "Moura", "Teixeira", "Dias", "Correia", "Castro", "Araújo", "Cardoso", "Rocha", "Santana", "Freitas", "Moreira", "Vieira", "Monteiro"],
  },
  Scotland: {
    first: ["Alistair", "Andrew", "Angus", "Callum", "Cameron", "Connor", "Craig", "Duncan", "Ewan", "Finlay", "Fraser", "Hamish", "Jack", "Jamie", "Lewis", "Liam", "Logan", "Ross", "Rory", "Scott", "Sean", "Struan", "Blair", "Calum", "Gavin", "Kieran"],
    last: ["Campbell", "MacDonald", "Stewart", "Murray", "Wilson", "Robertson", "Thomson", "Anderson", "MacLeod", "Scott", "Paterson", "Morrison", "Graham", "Fraser", "Hamilton", "Ferguson", "Duncan", "McLean", "Ross", "Young", "Brown", "Walker", "Mitchell", "Hunter", "Wallace", "Cameron"],
  },
  Belgium: {
    first: ["Arthur", "Bram", "Dries", "Elias", "Emiel", "Jasper", "Jens", "Jonas", "Joren", "Lars", "Louis", "Lucas", "Mats", "Mathis", "Noah", "Raf", "Rayan", "Simon", "Seppe", "Thibaut", "Wout", "Xander", "Yannick", "Milan", "Rune", "Niels"],
    last: ["Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens", "De Smet", "De Vos", "Vermeulen", "Vandenberghe", "De Clercq", "De Cock", "Aerts", "Michiels", "Verhoeven", "Vercammen", "Lambrechts", "Hermans", "De Ridder", "Van den Bossche", "De Bruyn", "Dierckx", "Smets", "Coppens"],
  },
  Poland: {
    first: ["Adam", "Antoni", "Bartosz", "Cezary", "Damian", "Filip", "Jakub", "Jan", "Kacper", "Karol", "Krzysztof", "Maciej", "Mateusz", "Michał", "Nikodem", "Oskar", "Piotr", "Szymon", "Tomasz", "Wiktor", "Wojciech", "Fabian", "Igor", "Leon", "Marcel", "Patryk"],
    last: ["Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski", "Zieliński", "Szymański", "Woźniak", "Dąbrowski", "Kozłowski", "Jankowski", "Mazur", "Kwiatkowski", "Krawczyk", "Piotrowski", "Grabowski", "Nowakowski", "Pawłowski", "Michalski", "Król", "Wieczorek", "Wróbel", "Jabłoński", "Adamczyk"],
  },
  Switzerland: {
    first: ["Adrian", "Alain", "Andrin", "Benjamin", "Cédric", "Dario", "Elia", "Fabio", "Felix", "Jan", "Joel", "Jonas", "Julian", "Luca", "Lukas", "Marco", "Matteo", "Noah", "Nils", "Nicolas", "Raphael", "Simon", "Silvan", "Yann", "Tim", "Roman"],
    last: ["Müller", "Meier", "Keller", "Huber", "Schmid", "Frei", "Weber", "Brunner", "Baumann", "Roth", "Steiner", "Gerber", "Graf", "Widmer", "Ziegler", "Bachmann", "Suter", "Zimmermann", "Kaufmann", "Hofmann", "Bucher", "Wenger", "Maurer", "Fischer", "Schneider", "Bieri"],
  },
  Denmark: {
    first: ["Alfred", "Anders", "August", "Benjamin", "Carl", "Christian", "Emil", "Frederik", "Gustav", "Jacob", "Johan", "Jonathan", "Lars", "Magnus", "Malte", "Mikkel", "Morten", "Noah", "Oliver", "Oscar", "Rasmus", "Sebastian", "Søren", "Theodor", "Victor", "William"],
    last: ["Jensen", "Nielsen", "Hansen", "Pedersen", "Andersen", "Christensen", "Larsen", "Sørensen", "Rasmussen", "Jørgensen", "Petersen", "Madsen", "Kristensen", "Olsen", "Thomsen", "Christiansen", "Poulsen", "Johansen", "Møller", "Mortensen", "Knudsen", "Laursen", "Lund", "Holm", "Bang", "Krogh"],
  },
  Sweden: {
    first: ["Alexander", "Albin", "Anton", "Axel", "Elias", "Elliot", "Emil", "Erik", "Felix", "Filip", "Hugo", "Isak", "Johan", "Leo", "Liam", "Ludvig", "Max", "Noah", "Oliver", "Oskar", "Samuel", "Simon", "Theo", "Viktor", "William", "Wilmer"],
    last: ["Andersson", "Johansson", "Karlsson", "Nilsson", "Eriksson", "Larsson", "Olsson", "Persson", "Svensson", "Gustafsson", "Pettersson", "Jonsson", "Jansson", "Hansson", "Bengtsson", "Lindberg", "Lindström", "Jakobsson", "Magnusson", "Olofsson", "Lundberg", "Björk", "Bergström", "Sandberg", "Holmberg", "Lundin"],
  },
  Norway: {
    first: ["Andreas", "Emil", "Elias", "Even", "Felix", "Henrik", "Isak", "Jakob", "Jonas", "Kristian", "Magnus", "Marius", "Mathias", "Noah", "Oskar", "Sander", "Sebastian", "Sindre", "Theodor", "Tobias", "Ulrik", "Vetle", "William", "Aksel", "Oliver", "Lukas"],
    last: ["Hansen", "Johansen", "Olsen", "Larsen", "Andersen", "Pedersen", "Nilsen", "Kristiansen", "Jørgensen", "Karlsen", "Johnsen", "Pettersen", "Eriksen", "Berg", "Haugen", "Hagen", "Johannessen", "Andreassen", "Jacobsen", "Dahl", "Halvorsen", "Lund", "Solberg", "Moen", "Knutsen", "Strand"],
  },
  Austria: {
    first: ["Alexander", "Anton", "Benjamin", "David", "Emil", "Felix", "Florian", "Jakob", "Jonas", "Julian", "Lukas", "Maximilian", "Moritz", "Niklas", "Noah", "Paul", "Philipp", "Simon", "Tobias", "Valentin", "Vincent", "Leon", "Fabian", "Matthias", "Raphael", "Sebastian"],
    last: ["Gruber", "Huber", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Hofer", "Berger", "Eder", "Fischer", "Schmid", "Winkler", "Mayr", "Schwarz", "Leitner", "Koller", "Brunner", "Wimmer", "Bauer", "Maier", "Egger", "Fuchs", "Lechner", "Wallner", "Schuster"],
  },
  Romania: {
    first: ["Andrei", "Bogdan", "Călin", "David", "Darius", "Denis", "Dragoș", "Eduard", "Gabriel", "Ionuț", "Luca", "Matei", "Mihai", "Rareș", "Radu", "Robert", "Sergiu", "Ștefan", "Vlad", "Victor", "Alexandru", "Cristian", "Florin", "Mario", "Nicolas", "Tudor"],
    last: ["Popescu", "Popa", "Pop", "Ionescu", "Stan", "Dumitru", "Gheorghe", "Stoica", "Radu", "Dobre", "Matei", "Ciobanu", "Marin", "Tudor", "Munteanu", "Mocanu", "Neagu", "Constantin", "Sandu", "Bălan", "Ilie", "Diaconu", "Nistor", "Coman", "Enache", "Florea"],
  },
  "Saudi Arabia": {
    first: ["Abdulrahman", "Abdullah", "Ahmed", "Ali", "Faisal", "Hamza", "Hassan", "Ibrahim", "Khalid", "Majed", "Mohammed", "Nasser", "Omar", "Saad", "Salem", "Sami", "Turki", "Waleed", "Yousef", "Ziyad", "Bader", "Mansour", "Rakan", "Sultan", "Yahya"],
    last: ["Alharbi", "Alqahtani", "Alghamdi", "Alshammari", "Alzahrani", "Aldosari", "Alotaibi", "Almutairi", "Alhassan", "Alasmari", "Almalki", "Alenezi", "Alshehri", "Alsubaie", "Alshahrani", "Alamri", "Alabdullah", "Alfahad", "Alsaeed", "Alrashid", "Alqahtani", "Alghamdi", "Alnasser", "Alrashidi", "Alharthi"],
  },
  Turkey: {
    first: ["Ahmet", "Ali", "Arda", "Baran", "Berk", "Berke", "Can", "Caner", "Emir", "Eren", "Furkan", "Hakan", "Kaan", "Kerem", "Mert", "Mertcan", "Mehmet", "Mustafa", "Oğuz", "Onur", "Ömer", "Sinan", "Taha", "Yiğit", "Yusuf", "Emre"],
    last: ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Aksoy", "Polat", "Erdoğan", "Güneş", "Bulut", "Şimşek", "Acar", "Taş"],
  },
};

const ALIASES: Record<string, string> = {
  España: "Spain",
  Inglaterra: "England",
  Francia: "France",
  Alemania: "Germany",
  Italia: "Italy",
  Portugal: "Portugal",
  "Países Bajos": "Netherlands",
  Holanda: "Netherlands",
  Argentina: "Argentina",
  Brasil: "Brazil",
  "Estados Unidos": "United States",
  "EE.UU.": "United States",
  Escocia: "Scotland",
  Bélgica: "Belgium",
  Polonia: "Poland",
  Suiza: "Switzerland",
  Dinamarca: "Denmark",
  Suecia: "Sweden",
  Noruega: "Norway",
  Austria: "Austria",
  Rumanía: "Romania",
  Turquía: "Turkey",
  "Arabia Saudí": "Saudi Arabia",
};

export function academyCountryKey(country: string): string {
  return ALIASES[country] ?? country;
}

const DISPLAY_NAMES: Record<string, string> = {
  Spain: "España",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Italy: "Italia",
  Portugal: "Portugal",
  Netherlands: "Países Bajos",
  "United States": "Estados Unidos",
  Argentina: "Argentina",
  Brazil: "Brasil",
  Scotland: "Escocia",
  Belgium: "Bélgica",
  Poland: "Polonia",
  Switzerland: "Suiza",
  Denmark: "Dinamarca",
  Sweden: "Suecia",
  Norway: "Noruega",
  Austria: "Austria",
  Romania: "Rumanía",
  Turkey: "Turquía",
  "Saudi Arabia": "Arabia Saudí",
};

export function academyCountryLabel(country: string): string {
  const key = academyCountryKey(country);
  return DISPLAY_NAMES[key] ?? country;
}

export function getAcademyNamePool(country: string): AcademyNamePool {
  return COUNTRY_NAMES[academyCountryKey(country)] ?? COUNTRY_NAMES.Spain;
}
