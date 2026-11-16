---
title: "Arecibo message"
url: "https://en.wikipedia.org/wiki/Arecibo_message"
object_id: "hercules_cluster"
source: "Wikipedia"
licence: "CC BY-SA 4.0 (Wikipedia contributors)"
retrieved_on: "2026-11-16"
---

The Arecibo message is an interstellar radio message carrying basic information about humanity and Earth that was sent to the globular cluster Messier 13 (M13) in 1974. It was meant as a demonstration of human technological achievement, rather than a real attempt to communicate with possible intelligent extraterrestrial life.
The message was broadcast into space a single time via frequency-modulated radio waves at a ceremony to mark the remodeling of the Arecibo Telescope in Puerto Rico on November 16, 1974. The message was aimed at the current location of M13, about 25,000 light years from Earth, because M13 was a large and relatively close collection of stars that was available in the sky at the time and place of the ceremony. When correctly translated into graphics, characters, and spaces, the 1,679 bits of data contained within the message form the image shown here.

# Description
The content of the Arecibo message was designed by a group of Cornell University and Arecibo scientists: Frank Drake, formulator of the Drake equation; James C. G. Walker; Linda M. French; and Richard Isaacman. Carl Sagan and others also contributed. The message was meant more as a demonstration of human technological achievement than a serious attempt to enter into a conversation with possible extraterrestrials. As globular cluster M13, at which the message was aimed, is more than 25,000 light-years from Earth, the message, traveling at the speed of light, will take at least 25,000 years to arrive there. By that time, the core of M13 will no longer be in precisely the same location because of the orbit of the star cluster around the Galactic Center. Even so, the proper motion of M13 is small, so the message will still arrive near the center of the cluster.
The message consists of seven parts that encode the following (from the top down in the image):

The numbers one to ten (white; left to right)
The atomic numbers of the elements hydrogen, carbon, nitrogen, oxygen, and phosphorus, which make up deoxyribonucleic acid (DNA) (purple)
The formulas for the chemical compounds that make up the nucleotides of DNA (green)
The estimated number of DNA nucleotides in the human genome, and a graphic of the double helix structure of DNA (white and blue, respectively)
The dimension (physical height, 5'9") of an average man (blue/white), a graphic figure of a human being (red), and the human population of Earth which was about 4 billion at the time (white)
A graphic of the Solar System (including Pluto), indicating which of the planets the message is coming from (yellow). The Sun is on the left and the third planet, Earth, raised toward the human figure
A graphic of the Arecibo radio telescope and the dimension (the physical diameter) of the transmitting antenna dish (purple, white, and blue)
The entire message consisted of 1,679 binary digits, approximately 210 bytes, transmitted at a frequency of 2,380 MHz and modulated by shifting the frequency by 10 Hz, with a power of 450 kW. The "ones" and "zeros" were transmitted by frequency shifting at the rate of 10 bits per second. The total broadcast was less than three minutes.
The number 1,679 was chosen because it is a semiprime (the product of two prime numbers), to be arranged rectangularly as 73 rows by 23 columns. The alternative arrangement, 23 rows by 73 columns, produces an unintelligible set of characters.

## Message as binary string
The message as a binary string is included below. Note that the choice of 1 representing higher frequency and 0 representing lower frequency is entirely arbitrary and the line breaks after every 23 bits are only included to allow for some ease in human readability.

## Numbers
1 2 3 4 5 6 7 8  9 10
----------------------
0 0 0 1 1 1 1 00 00 00
0 1 1 0 0 1 1 00 00 10
1 0 1 0 1 0 1 01 11 01
X X X X X X X X X  X <-Least-significant-digit marker.

The numbers from 1 to 10 appear in binary format, to be read from the top down. The bottom row contains markers which indicate the column from which the binary code for each number is intended to begin.
Even assuming that any extraterrestrial recipients would recognize binary, the encoding of the numbers may not be immediately obvious because of the way they have been written. To read the first seven digits, ignore the bottom row, and read them as three binary digits from top to bottom, with the top digit being the most significant. The readings for 8, 9, and 10 are a little different, as their binary code has been distributed across an additional column next to the first (to the right in the image). This is intended to show that numbers too large to fit in a single column can be written in several contiguous ones (a scheme which is used elsewhere in the message). The additional columns are not marked by the least-significant-digit marker.

## DNA elements
H C N O P
1 6 7 8 15
----------
0 0 0 1 1
0 1 1 0 1
0 1 1 0 1
1 0 1 0 1
X X X X X

The numbers 1, 6, 7, 8, and 15 appear, denoting the atomic numbers of hydrogen (H), carbon (C), nitrogen (N), oxygen (O), and phosphorus (P), the elements from which DNA is composed.

## Nucleotides
The chemical groups from which the nucleotides of polymeric DNA sequences are built – the sugar deoxyribose, phosphate, and the four canonical nucleobases used in DNA – are then described as sequences of the five elements that appear on the preceding line. Each sequence represents the molecular formula of the chemical as it exists when incorporated into DNA (as opposed to the free form).
For example, the compound in the top left in the image is deoxyribose (C5H7O in DNA, C5H10O4 when free), whose formula is read as:

11000
10000
11010
XXXXX
-----
75010

i.e., 7 atoms of hydrogen, 5 atoms of carbon, 0 atoms of nitrogen, 1 atom of oxygen, and 0 atoms of phosphorus.
It is displayed in this order because the DNA Elements in the previous section (Purple image as reference) describe hydrogen (H), carbon (C), nitrogen (N), oxygen (O), and phosphorus (P) in that order as well.

## Double helix
11
11
11
11
11
01
11
11
01
11
01
11
10
11
11
01
X

11111111 11110111 11111011 01011110 (binary) [Using the double vertical columns above, read from top to bottom starting from the right column first, and then top to bottom from the left column.]
= 4,294,441,822 (decimal)

A graphic of the approximate shape of the double helix in which double-stranded DNA polymers naturally exist; the vertical bar in the middle is a binary representation of the number of nucleotide base pairs in the human genome. The value depicted is around 4.3 billion, which was believed to be the case when the message was transmitted in 1974; it is now known that there are only approximately 3.2 billion base pairs in the human genome.

## Humanity
The graphic in the center is a simple illustration of a human being. The element on the left (in the image) indicates the average height of an adult male in the US: 1.764 m (5 ft 9.4 in). This value is indicated by a horizontally written binary representation of the number 14, which is intended to be multiplied by the wavelength of the message (126 mm); 14 × 126 = 1,764 millimeters.
The element on the right of the image indicates the size of the global human population in 1974, approximately 4.3 billion (which, coincidentally, is within 0.1% of the number of DNA base pairs suggested for the size of the human genome earlier in the message). In this case, the number is oriented in the data horizontally rather than vertically. The least-significant-digit marker is in the upper left in the image, with bits going to the right and more significant digits below.

## Planets
                  Earth
Sun Mercury Venus       Mars Jupiter Saturn Uranus Neptune Pluto

A graphic depicting the Solar System, showing the Sun and the (then) nine planets in the order of their distance from the Sun: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto (Pluto was reclassified in 2006 as a dwarf planet by the International Astronomical Union). Earth is the third planet from the Sun; its graphic is shifted up to identify it as the planet from which the signal was sent. Additionally, the human figure is shown just above the Earth graphic.
In addition to showing position, the graphic provides a general, not-to-scale size reference of each planet and the Sun.

## Telescope
bottom middle two rows shown in White as reference in the image:
     100101
<--- 111110X --->100101 111110 (binary) = 2,430 (decimal)

The last part is a graphic representing the Arecibo radio telescope and indicating its diameter with a binary representation of the number 2,430; multiplying by the wavelength of 126 mm gives 306.18 m (1,004 ft 6 in). In this case, the number is oriented horizontally, with the least-significant-digit marker to the lower right in the image.
The part of the image that resembles a letter "M" is there to demonstrate that the curved line is a concave curved mirror.

# Arecibo Answer crop circle hoax
The "Hampshire pattern" or "Chilbolton Code formation" or "Arecibo answer" was a crop circle that appeared in 2001 near the Chilbolton radio telescope in Hampshire, UK, which echoed the visual representation and most of the information from the original Arecibo message with some significant differences including location/origin, DNA configuration, and appearance.
The SETI Institute Online rebutted the idea that this was a genuine extraterrestrial response, by saying, "This is highly improbable. There is no evidence to suggest an other-than-earthly origin for these graphics." The crop circle is a near replica of the Arecibo message, with the same 23 × 73 grid. Most of the chemical data remains the same, with the exception that in the section detailing important chemical elements, silicon has been added, and the diagram of DNA has been rewritten. At the bottom, the pictogram of a human is replaced with a figure with a large, bulbous head. A solar system with nine planets is also depicted, with emphasis placed on the 3rd, 4th, and 5th planets of the system. The Arecibo telescope is replaced by a replica of a crop circle that appeared in the same field one year before, and the binary representation of the transmitter's diameter is altered.

# Computational analysis
Some researchers have analysed whether the Arecibo signal could be identified as a carrying message by some information theoretic measure that was agnostic in the sense that it does not know the particular shapes of a human or double-helix etc. Presumably such an agnostic measure would be all that any potential ETI could apply to this signal. It is also a useful testbed for humanity's own ability to detect potential extraterrestrial signals, as we would presumably be similarly agnostic about any shapes particularly special to the broadcasting ETI.
Mahon (2025) described an information theoretic measure of complexity, the LCC score, that gives a high score to human language and meaningful images (such as photographs or drawings), and to the Arecibo message, while also giving a low score to random noise signals and simple repetitive signals. This measure also identified the correct aspect ratio of 73 by 23. Other attempts have been made with varying degrees of success. Zenil et al. (2023) also identified the correct aspect ratio and distinguished it from random noise signals, but not from uniform or repetitive signals. McCowan et al. (1999) described a measure called entropic slope, which could differentiate between random noise or repetitive signals, and meaningful vocalisations by multiple species including humans, but did not detect a message in the Arecibo signal.
