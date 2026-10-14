# Original minimal command-line example of bit stuffing and destuffing (kept as written).
# The tested reference implementation, with validation, framing, CRC and a CLI, is in python/ (package bitcomm):
#   python -m bitcomm stuff 01111110     (run from python/src, or pip install -e python)

def bit_stuffing(bits):
    stuffed = []
    count = 0
    for bit in bits:
        stuffed.append(bit)
        if bit == '1':
            count += 1
            if count == 5:
                stuffed.append('0')
                count = 0
        else:
            count = 0
    return ''.join(stuffed)

def bit_destuffing(stuffed_bits):
    destuffed = []
    count = 0
    i = 0
    while i < len(stuffed_bits):
        destuffed.append(stuffed_bits[i])
        if stuffed_bits[i] == '1':
            count += 1
            if count == 5:
                i += 1  # Skip the stuffed '0'
                count = 0
        else:
            count = 0
        i += 1
    return ''.join(destuffed)

# Example usage
if __name__ == "__main__":
    input_bits = "01111110"
    stuffed = bit_stuffing(input_bits)
    destuffed = bit_destuffing(stuffed)
    print(f"Original: {input_bits}")
    print(f"Stuffed: {stuffed}")
    print(f"Destuffed: {destuffed}")
