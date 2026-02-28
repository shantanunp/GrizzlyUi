# 💰 Decimal/Money Type & 🔍 Regular Expressions - Feature Guide

## Overview

Two powerful new features for banking data transformations:
- **Decimal Type**: Exact precision for money calculations (no float errors!)
- **Regular Expressions**: Validate, extract, and transform text patterns

---

## 💰 Decimal/Money Type

### Why Decimal Instead of Float?

**The Problem with Floats:**
```python
# WRONG - Float arithmetic has precision errors!
price = 0.1
tax = 0.2
total = price + tax  # 0.30000000000000004 ❌

# WRONG - Money calculations break!
amount = 0.3 * 3  # 0.8999999999999999 ❌
```

**The Solution - Decimal:**
```python
# RIGHT - Exact precision!
price = Decimal("0.1")
tax = Decimal("0.2")
total = price + tax  # Decimal('0.3') ✓

# RIGHT - Money calculations work!
amount = Decimal("0.3") * 3  # Decimal('0.9') ✓
```

### Operations

#### 1. Create Decimal

**UI:**
```
┌─────────────────────────────┐
│ 💰 Decimal/Money            │
├─────────────────────────────┤
│ Operation: Create Decimal   │
│ Variable Name: amount       │
│ Value Source: INPUT.balance │
└─────────────────────────────┘
```

**Generated Code:**
```python
amount = Decimal(INPUT.balance)
# or
amount = Decimal("1234.56")
```

**Use Cases:**
- Convert input values to exact precision
- Initialize money values
- Parse currency strings

#### 2. Add

**UI:**
```
┌─────────────────────────────┐
│ Operation: Add              │
│ Result Variable: total      │
│ First Value: principal      │
│ Second Value: interest      │
└─────────────────────────────┘
```

**Generated Code:**
```python
total = principal + interest
```

**Example:**
```python
principal = Decimal("10000.00")
interest = Decimal("250.50")
total = principal + interest  # Decimal('10250.50')
```

#### 3. Subtract

**Generated Code:**
```python
remaining = balance - withdrawal
```

**Example:**
```python
balance = Decimal("5000.00")
withdrawal = Decimal("750.25")
remaining = balance - withdrawal  # Decimal('4249.75')
```

#### 4. Multiply

**Generated Code:**
```python
interest = principal * rate
```

**Example:**
```python
principal = Decimal("10000.00")
rate = Decimal("0.05")  # 5%
interest = principal * rate  # Decimal('500.00')
```

#### 5. Divide

**Generated Code:**
```python
monthly_payment = total / months
```

**Example:**
```python
total = Decimal("12000.00")
months = Decimal("12")
monthly_payment = total / months  # Decimal('1000.00')
```

#### 6. Round

**UI:**
```
┌─────────────────────────────┐
│ Operation: Round            │
│ Decimal Variable: amount    │
│ Decimal Places: 2 (cents)   │
└─────────────────────────────┘
```

**Generated Code:**
```python
round(amount, 2)
```

**Example:**
```python
amount = Decimal("1234.5678")
rounded = round(amount, 2)  # Decimal('1234.57')
```

### Real-World Examples

#### Interest Calculation
```python
def transform(INPUT):
    OUTPUT = {}
    
    # Create Decimals from input
    principal = Decimal(INPUT.loanAmount)
    rate = Decimal("0.05")  # 5% annual rate
    years = Decimal(INPUT.loanYears)
    
    # Calculate interest (exact!)
    interest = principal * rate * years
    total = principal + interest
    
    # Round for output
    OUTPUT["principal"] = str(round(principal, 2))
    OUTPUT["interest"] = str(round(interest, 2))
    OUTPUT["total"] = str(round(total, 2))
    
    return OUTPUT

# Input: {"loanAmount": "10000", "loanYears": "5"}
# Output: {
#   "principal": "10000.00",
#   "interest": "2500.00",
#   "total": "12500.00"
# }
```

#### Currency Conversion
```python
def transform(INPUT):
    OUTPUT = {}
    
    # USD to EUR conversion
    usd_amount = Decimal(INPUT.usdAmount)
    exchange_rate = Decimal("0.92")  # 1 USD = 0.92 EUR
    
    eur_amount = usd_amount * exchange_rate
    
    OUTPUT["usd"] = str(round(usd_amount, 2))
    OUTPUT["eur"] = str(round(eur_amount, 2))
    
    return OUTPUT
```

#### Payment Distribution
```python
def transform(INPUT):
    OUTPUT = {}
    
    total_payment = Decimal(INPUT.payment)
    principal_percent = Decimal("0.80")  # 80% to principal
    interest_percent = Decimal("0.20")   # 20% to interest
    
    to_principal = total_payment * principal_percent
    to_interest = total_payment * interest_percent
    
    OUTPUT["toPrincipal"] = str(round(to_principal, 2))
    OUTPUT["toInterest"] = str(round(to_interest, 2))
    
    return OUTPUT
```

### Important Notes

**Always Use Strings for Decimal Creation:**
```python
# GOOD
amount = Decimal("1234.56")
rate = Decimal("0.05")

# BAD (defeats the purpose!)
amount = Decimal(1234.56)  # Still uses float internally!
```

**Convert to String for OUTPUT:**
```python
# Decimal objects need to be converted to string for JSON output
OUTPUT["amount"] = str(round(total, 2))
```

**Use in Comparisons:**
```python
if balance >= Decimal("1000.00"):
    OUTPUT["tier"] = "premium"
```

---

## 🔍 Regular Expressions

### Operations

#### 1. Match (Validate)

**UI:**
```
┌────────────────────────────────┐
│ 🔍 Regex                       │
├────────────────────────────────┤
│ Operation: Match (validate)    │
│ Pattern: ^\d{3}-\d{2}-\d{4}$  │
│ Source: INPUT.ssn              │
└────────────────────────────────┘
```

**Generated Code:**
```python
re.match(r"^\d{3}-\d{2}-\d{4}$", INPUT.ssn)
```

**Use Case - Validation:**
```python
# Validate SSN format
if re.match(r"^\d{3}-\d{2}-\d{4}$", INPUT.ssn):
    OUTPUT["validSSN"] = True
else:
    OUTPUT["validSSN"] = False

# Validate email
if re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", INPUT.email):
    OUTPUT["validEmail"] = True
```

**Use in For Loop:**
```python
# Filter valid emails
for email in INPUT.emailList:
    if re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email):
        OUTPUT["validEmails"].append(email)
```

#### 2. Search (Find)

**Generated Code:**
```python
re.search(r"\d+", INPUT.text)
```

**Use Case - Extract First Match:**
```python
# Find account number in text
match = re.search(r"ACC-\d{6}", INPUT.description)
if match:
    OUTPUT["accountNumber"] = match.group()
```

#### 3. Find All

**Generated Code:**
```python
re.findall(r"[\w\.-]+@[\w\.-]+", INPUT.text)
```

**Use Case - Extract Multiple Matches:**
```python
# Extract all email addresses from text
emails = re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", INPUT.emailText)
OUTPUT["extractedEmails"] = emails

# Extract all phone numbers
phones = re.findall(r"\d{3}-\d{3}-\d{4}", INPUT.contactInfo)
OUTPUT["phoneNumbers"] = phones
```

#### 4. Replace (Transform)

**UI:**
```
┌────────────────────────────────┐
│ Operation: Replace             │
│ Pattern: \D                    │
│ Source: INPUT.phone            │
│ Replace With: (empty)          │
└────────────────────────────────┘
```

**Generated Code:**
```python
re.sub(r"\D", "", INPUT.phone)
```

**Use Cases:**

**Remove Non-Digits:**
```python
# Clean phone number
cleanPhone = re.sub(r"\D", "", INPUT.phone)
# "(555) 123-4567" → "5551234567"

# Clean SSN
cleanSSN = re.sub(r"-", "", INPUT.ssn)
# "123-45-6789" → "123456789"
```

**Mask Sensitive Data:**
```python
# Mask SSN (show last 4 only)
masked = re.sub(r"\d(?=\d{4})", "*", INPUT.ssn)
# "123-45-6789" → "***-**-6789"
```

**Normalize Whitespace:**
```python
# Replace multiple spaces with single space
normalized = re.sub(r"\s+", " ", INPUT.address)
# "123  Main    St" → "123 Main St"
```

#### 5. Split

**Generated Code:**
```python
re.split(r",", INPUT.text)
```

**Use Case - Parse Delimited Data:**
```python
# Split CSV
values = re.split(r",", INPUT.csvLine)
OUTPUT["firstName"] = values[0]
OUTPUT["lastName"] = values[1]

# Split by multiple delimiters
parts = re.split(r"[;,|]", INPUT.data)
```

### Common Patterns

#### SSN (Social Security Number)
```python
pattern = r"^\d{3}-\d{2}-\d{4}$"
# Matches: 123-45-6789
# Doesn't match: 12-345-6789, 123456789
```

#### Email
```python
pattern = r"^[\w\.-]+@[\w\.-]+\.\w+$"
# Matches: user@example.com, first.last@company.co.uk
# Doesn't match: invalid@, @example.com
```

#### Phone (US)
```python
pattern = r"^\d{3}-\d{3}-\d{4}$"
# Matches: 555-123-4567
# Doesn't match: (555) 123-4567, 5551234567
```

#### Digits Only
```python
pattern = r"\d+"
# Matches any sequence of digits
```

#### Letters Only
```python
pattern = r"[A-Za-z]+"
# Matches any sequence of letters
```

#### Remove Non-Digits
```python
pattern = r"\D"  # Use with replace, replacement = ""
# Removes everything that's not a digit
```

### Real-World Examples

#### Validate and Clean SSN
```python
def transform(INPUT):
    OUTPUT = {}
    
    # Validate format
    if re.match(r"^\d{3}-\d{2}-\d{4}$", INPUT.ssn):
        OUTPUT["validFormat"] = True
        # Remove dashes for storage
        OUTPUT["ssn"] = re.sub(r"-", "", INPUT.ssn)
    else:
        OUTPUT["validFormat"] = False
        OUTPUT["error"] = "Invalid SSN format"
    
    return OUTPUT
```

#### Extract All Emails from Text
```python
def transform(INPUT):
    OUTPUT = {}
    OUTPUT["emails"] = []
    
    # Find all email addresses
    emails = re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", INPUT.contactText)
    
    # Validate and add each one
    for email in emails:
        if re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email):
            OUTPUT["emails"].append(email.lower())
    
    return OUTPUT

# Input: {"contactText": "Contact: john@example.com or jane@test.org"}
# Output: {"emails": ["john@example.com", "jane@test.org"]}
```

#### Clean and Format Phone Numbers
```python
def transform(INPUT):
    OUTPUT = {}
    
    # Remove all non-digits
    digits = re.sub(r"\D", "", INPUT.phone)
    
    # Validate it's 10 digits
    if len(digits) == 10:
        # Format as XXX-XXX-XXXX
        OUTPUT["phone"] = f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"
        OUTPUT["valid"] = True
    else:
        OUTPUT["phone"] = INPUT.phone
        OUTPUT["valid"] = False
    
    return OUTPUT

# Input: {"phone": "(555) 123-4567"}
# Output: {"phone": "555-123-4567", "valid": true}
```

#### Validate Multiple Fields
```python
def transform(INPUT):
    OUTPUT = {}
    OUTPUT["validations"] = {}
    
    # Validate SSN
    OUTPUT["validations"]["ssn"] = bool(
        re.match(r"^\d{3}-\d{2}-\d{4}$", INPUT.ssn)
    )
    
    # Validate Email
    OUTPUT["validations"]["email"] = bool(
        re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", INPUT.email)
    )
    
    # Validate Phone
    OUTPUT["validations"]["phone"] = bool(
        re.match(r"^\d{3}-\d{3}-\d{4}$", INPUT.phone)
    )
    
    # Overall valid if all pass
    OUTPUT["allValid"] = all(OUTPUT["validations"].values())
    
    return OUTPUT
```

#### Filter Transactions by Pattern
```python
def transform(INPUT):
    OUTPUT = {}
    OUTPUT["validTransactions"] = []
    
    # Only include transactions with valid IDs (format: TXN-XXXXXX)
    for transaction in INPUT.transactions:
        if re.match(r"^TXN-\d{6}$", transaction.id):
            OUTPUT["validTransactions"].append(transaction)
    
    return OUTPUT
```

---

## 🎯 Combined Examples (Decimal + Regex)

### Loan Application Processor
```python
def transform(INPUT):
    OUTPUT = {}
    
    # REGEX: Validate SSN
    if not re.match(r"^\d{3}-\d{2}-\d{4}$", INPUT.ssn):
        OUTPUT["error"] = "Invalid SSN format"
        return OUTPUT
    
    # REGEX: Clean SSN for storage
    OUTPUT["ssn"] = re.sub(r"-", "", INPUT.ssn)
    
    # DECIMAL: Calculate loan details
    principal = Decimal(INPUT.loanAmount)
    rate = Decimal("0.05")  # 5% annual
    years = Decimal(INPUT.loanYears)
    
    # Exact interest calculation
    total_interest = principal * rate * years
    total_amount = principal + total_interest
    monthly_payment = total_amount / (years * Decimal("12"))
    
    # Output with proper precision
    OUTPUT["principal"] = str(round(principal, 2))
    OUTPUT["interest"] = str(round(total_interest, 2))
    OUTPUT["total"] = str(round(total_amount, 2))
    OUTPUT["monthlyPayment"] = str(round(monthly_payment, 2))
    
    return OUTPUT
```

### Customer Data Cleaner
```python
def transform(INPUT):
    OUTPUT = {}
    
    # REGEX: Validate and clean email
    if re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", INPUT.email):
        OUTPUT["email"] = INPUT.email.lower()
        OUTPUT["validEmail"] = True
    else:
        OUTPUT["validEmail"] = False
    
    # REGEX: Clean phone (remove formatting)
    cleanPhone = re.sub(r"\D", "", INPUT.phone)
    if len(cleanPhone) == 10:
        OUTPUT["phone"] = cleanPhone
        OUTPUT["validPhone"] = True
    else:
        OUTPUT["validPhone"] = False
    
    # DECIMAL: Calculate account balance
    if OUTPUT["validEmail"] and OUTPUT["validPhone"]:
        deposits = Decimal(INPUT.deposits)
        withdrawals = Decimal(INPUT.withdrawals)
        balance = deposits - withdrawals
        
        OUTPUT["balance"] = str(round(balance, 2))
        
        # Determine tier based on balance
        if balance >= Decimal("100000"):
            OUTPUT["tier"] = "platinum"
        elif balance >= Decimal("50000"):
            OUTPUT["tier"] = "gold"
        else:
            OUTPUT["tier"] = "standard"
    
    return OUTPUT
```

---

## 🎨 UI Tips

### When to Use Decimal
- ✅ Money amounts
- ✅ Interest rates
- ✅ Currency conversions
- ✅ Payment calculations
- ✅ Any financial math
- ❌ Whole numbers (use regular int)
- ❌ Counting items (use regular int)

### When to Use Regex
- ✅ Validate formats (SSN, email, phone)
- ✅ Extract patterns (emails from text)
- ✅ Clean data (remove dashes, spaces)
- ✅ Filter items (valid IDs only)
- ✅ Transform text (mask sensitive data)
- ❌ Simple equality checks (use ==)
- ❌ Simple string operations (use .upper(), .lower())

---

## ⚠️ Important Notes

### Decimal
1. **Always use strings**: `Decimal("1234.56")` not `Decimal(1234.56)`
2. **Convert for output**: Use `str(round(value, 2))` for JSON
3. **Use in comparisons**: `if balance >= Decimal("1000")`
4. **Import not needed**: Engine provides Decimal built-in

### Regex
1. **Use raw strings**: Patterns use `r"pattern"` format
2. **Escape special chars**: `\.` for literal dot, `\d` for digit
3. **Test patterns**: Use regex testers before deploying
4. **Import not needed**: Engine provides `re` module built-in

---

**You're now ready to handle exact money calculations and powerful text processing!** 💪
