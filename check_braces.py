
import sys

def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    lines = content.split('\n')
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '{':
                stack.append(('{', line_num))
            elif char == '}':
                if not stack:
                    print(f"Extra '}}' at line {line_num}")
                    return
                stack.pop()
    
    if stack:
        for char, line_num in stack:
            print(f"Unclosed '{char}' from line {line_num}")
    else:
        print("Braces are balanced")

if __name__ == "__main__":
    check_balance(r"c:\Hafiz Wrg\database\Game\app\page.tsx")
