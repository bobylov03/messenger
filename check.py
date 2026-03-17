import asyncio
import re
from datetime import datetime
from telethon import TelegramClient
import pandas as pd
import nest_asyncio
import os

nest_asyncio.apply()

# ============= НАСТРОЙКИ =============
API_ID = 35483656
API_HASH = '321a0957343e0dc3970092eb854196d9'
PHONE_NUMBER = '+447868382209'
CHAT_ID = -4931606491
EXCEL_FILENAME = 'vessels_data.xlsx'
# ======================================

def clean_text(text):
    """Очищает текст от лишних пробелов"""
    if text is None:
        return ''
    if isinstance(text, str):
        text = text.strip()
        text = re.sub(r'\s+', ' ', text)
        return text
    return str(text)

def extract_between_markers(lines, start_marker, end_marker):
    """
    Извлекает текст между двумя маркерами
    
    Args:
        lines: список строк сообщения
        start_marker: маркер начала (что ищем)
        end_marker: маркер конца (что ищем как конец)
    
    Returns:
        str: извлеченный текст
    """
    result_lines = []
    found_start = False
    
    for line in lines:
        # Ищем маркер начала
        if not found_start and start_marker in line:
            found_start = True
            # Если в этой же строке есть текст после маркера
            if ':' in line:
                parts = line.split(':', 1)
                if len(parts) > 1 and parts[1].strip():
                    result_lines.append(parts[1].strip())
            elif '-' in line:
                parts = line.split('-', 1)
                if len(parts) > 1 and parts[1].strip():
                    result_lines.append(parts[1].strip())
            continue
        
        # Если нашли начало, собираем строки до маркера конца
        if found_start:
            # Проверяем маркер конца
            if end_marker in line:
                break
            
            # Добавляем непустые строки
            if line.strip():
                result_lines.append(line.strip())
    
    return ' '.join(result_lines)

def parse_vessel_message(text):
    """Парсер с четкой логикой маркеров для каждого поля"""
    if not text:
        return None
    
    lines = text.split('\n')
    
    # Инициализируем все поля
    data = {
        'Vessel Name': '',
        'IMO': '',
        'Type': '',
        'Flag': '',
        'Class': '',
        'P&I Club': '',
        'Tracking Last Year': '',
        'RED Status': '',
        'OFAC Status': '',
        'UANI Status': '',
        'UK Status': '',
        'EU Status': '',
        'News': '',
        'Speed Laden': '',
        'Speed Ballast': '',
        'Black MoU': '',
        'Med MoU': '',
        'Paris MoU': '',
        'Tokyo MoU': '',
        'CAP': '',
        'BWTS': '',
        'Next Dry Dock': '',
        'Special Survey': '',
        'Cargo Tank Capacity': '',
        'SLOPS Capacity': '',
        'Cargo Heating': '',
        'SLOPS Heating': '',
        'Last SIRE Date': '',
        'Last SIRE Location': '',
        'Registered Owner': '',
        'Technical Manager': '',
        'Commercial Operator': '',
        'Call to USA/Israel': '',
        'Kozmino': '',
        'Conditions of Class': ''
    }
    
    # ============= СТРОКА 1: Название, IMO, Тип =============
    if lines:
        first_line = lines[0].strip()
        match = re.search(r'(.+?)\s*\((\d{7})\)\s*(.+)', first_line)
        if match:
            data['Vessel Name'] = clean_text(match.group(1))
            data['IMO'] = clean_text(match.group(2))
            data['Type'] = clean_text(match.group(3))
    
    # ============= Flag =============
    flag_text = extract_between_markers(lines, 'Flag -', 'Class -')
    if flag_text:
        data['Flag'] = clean_text(flag_text)
    
    # ============= Class =============
    class_text = extract_between_markers(lines, 'Class -', 'P&I Information -')
    if class_text:
        data['Class'] = clean_text(class_text)
    
    # ============= P&I Club =============
    pi_text = extract_between_markers(lines, 'P&I Information -', '1.')
    if pi_text:
        data['P&I Club'] = clean_text(pi_text)
    
    # ============= 1. Tracking last year =============
    tracking_text = extract_between_markers(lines, '1. Tracking last year:', '2.')
    if tracking_text:
        data['Tracking Last Year'] = clean_text(tracking_text)
    
    # ============= 2. RED Status =============
    red_text = extract_between_markers(lines, '2.', '3.')
    if red_text:
        data['RED Status'] = clean_text(red_text)
    
    # ============= 3. OFAC =============
    ofac_text = extract_between_markers(lines, '3. OFAC:', '4.')
    if ofac_text:
        data['OFAC Status'] = clean_text(ofac_text)
    
    # ============= 4. UANI =============
    uani_text = extract_between_markers(lines, '4. UANI:', '5.')
    if uani_text:
        data['UANI Status'] = clean_text(uani_text)
    
    # ============= 5. UK =============
    uk_text = extract_between_markers(lines, '5. UK:', '6.')
    if uk_text:
        data['UK Status'] = clean_text(uk_text)
    
    # ============= 6. EU =============
    eu_text = extract_between_markers(lines, '6. EU:', '7.')
    if eu_text:
        data['EU Status'] = clean_text(eu_text)
    
    # ============= 7. News =============
    news_text = extract_between_markers(lines, '7. News:', '8.')
    if news_text:
        data['News'] = clean_text(news_text)
    
    # ============= 8. Speed =============
    speed_text = extract_between_markers(lines, '8. Speed:', '9.')
    laden_match = re.search(r'laden\s*([\d,\.]+)', speed_text)
    if laden_match:
        data['Speed Laden'] = laden_match.group(1).replace(',', '.')
    ballast_match = re.search(r'ballast\s*([\d,\.]+)', speed_text)
    if ballast_match:
        data['Speed Ballast'] = ballast_match.group(1).replace(',', '.')
    
    # ============= 9. Black MoU =============
    black_text = extract_between_markers(lines, '9. Black MoU:', '10:')
    if black_text:
        data['Black MoU'] = clean_text(black_text)
    
    # ============= 10: Med MoU =============
    med_text = extract_between_markers(lines, '10:', '11.')
    if med_text:
        data['Med MoU'] = clean_text(med_text)
    
    # ============= 11. Paris MoU =============
    paris_text = extract_between_markers(lines, '11. Paris MoU:', '12.')
    if paris_text:
        data['Paris MoU'] = clean_text(paris_text)
    
    # ============= 12. Tokyo MoU =============
    tokyo_text = extract_between_markers(lines, '12. Tokyo MoU:', '13.')
    if tokyo_text:
        data['Tokyo MoU'] = clean_text(tokyo_text)
    
    # ============= 13. CAP =============
    cap_text = extract_between_markers(lines, '13. CAP:', '14.')
    if cap_text:
        data['CAP'] = clean_text(cap_text)
    
    # ============= 14. BWTS =============
    bwts_text = extract_between_markers(lines, '14. BWTS:', '15.')
    if bwts_text:
        data['BWTS'] = clean_text(bwts_text)
    
    # ============= 15. Next dry dock / Special survey =============
    dates_text = extract_between_markers(lines, '15. Date next dry dock / special survey:', '16.')
    if dates_text:
        parts = dates_text.split('/')
        if len(parts) >= 2:
            data['Next Dry Dock'] = clean_text(parts[0])
            data['Special Survey'] = clean_text(parts[1])
    
    # ============= 16. Cargo tank capacity =============
    cargo_text = extract_between_markers(lines, '16. Cargo tank capacity:', '17.')
    cap_match = re.search(r'([\d,\.]+)', cargo_text)
    if cap_match:
        data['Cargo Tank Capacity'] = cap_match.group(1).replace(',', '')
    
    # Ищем SLOPS в этом блоке
    for line in lines:
        if 'SLOPS:' in line and '16.' not in line:
            slops_match = re.search(r'SLOPS:\s*([\d,\.]+)', line)
            if slops_match:
                data['SLOPS Capacity'] = slops_match.group(1).replace(',', '')
                break
    
    # ============= 17. Cargo heating =============
    heating_text = extract_between_markers(lines, '17. Cargo tank heating:', '18.')
    if heating_text:
        data['Cargo Heating'] = clean_text(heating_text)
    
    # Ищем SLOPS Heating
    for line in lines:
        if 'SLOPS:' in line and 'heating' in line.lower():
            slops_heat = line.replace('SLOPS:', '').strip()
            if slops_heat:
                data['SLOPS Heating'] = clean_text(slops_heat)
                break
    
    # ============= 18. Last SIRE =============
    sire_text = extract_between_markers(lines, '18. Last SIRE:', '19.')
    if sire_text:
        parts = sire_text.split('/', 1)
        if len(parts) >= 1:
            data['Last SIRE Date'] = clean_text(parts[0])
        if len(parts) >= 2:
            data['Last SIRE Location'] = clean_text(parts[1])
    
    # ============= 19. Registered Owner =============
    owner_text = extract_between_markers(lines, '19. Registered Owner:', 'Technical manager:')
    if owner_text:
        data['Registered Owner'] = clean_text(owner_text)
    
    # ============= Technical manager =============
    tech_text = extract_between_markers(lines, 'Technical manager:', 'Commercial operator:')
    if tech_text:
        data['Technical Manager'] = clean_text(tech_text)
    
    # ============= Commercial operator =============
    comm_text = extract_between_markers(lines, 'Commercial operator:', '20.')
    if comm_text:
        data['Commercial Operator'] = clean_text(comm_text)
    
    # ============= 20. Call to USA/Israel =============
    call_text = extract_between_markers(lines, '20. Call to USA / Israel last 5 years:', '21.')
    if call_text:
        data['Call to USA/Israel'] = clean_text(call_text)
    
    # ============= 21. Kozmino =============
    koz_text = extract_between_markers(lines, '21. Kozmino:', '22.')
    if koz_text:
        data['Kozmino'] = clean_text(koz_text)
    
    # ============= 22. Conditions of class =============
    cond_text = extract_between_markers(lines, '22. Conditions of class:', None)
    if cond_text:
        data['Conditions of Class'] = clean_text(cond_text)
    
    # Проверяем, что нашли название
    if data['Vessel Name']:
        return data
    return None

async def collect_vessels():
    """Основная функция сбора данных"""
    client = TelegramClient('session_name', API_ID, API_HASH)
    
    try:
        await client.start(phone=PHONE_NUMBER)
        print("Успешно подключились к Telegram!")
        
        chat = await client.get_entity(CHAT_ID)
        print(f"Чат: {chat.title if hasattr(chat, 'title') else 'Private Chat'}")
        
        all_vessels_data = []
        message_count = 0
        vessel_count = 0
        
        print("\nНачинаем сбор сообщений...")
        
        async for message in client.iter_messages(chat, reverse=True):
            message_count += 1
            
            if message.text:
                parsed_data = parse_vessel_message(message.text)
                if parsed_data:
                    all_vessels_data.append(parsed_data)
                    vessel_count += 1
                    
                    if vessel_count % 5 == 0:
                        print(f"✅ Найдено судов: {vessel_count} (проверено сообщений: {message_count})")
        
        print(f"\n{'='*50}")
        print(f"ИТОГИ СБОРА:")
        print(f"{'='*50}")
        print(f"Проверено сообщений: {message_count}")
        print(f"Найдено судов: {vessel_count}")
        
        if all_vessels_data:
            df = pd.DataFrame(all_vessels_data)
            df = df.replace(r'^\s*$', pd.NA, regex=True)
            
            print(f"\n{'='*50}")
            print("СТАТИСТИКА ЗАПОЛНЕННОСТИ ПОЛЕЙ:")
            print(f"{'='*50}")
            
            for col in df.columns:
                filled = df[col].count()
                percent = (filled / len(df)) * 100
                print(f"{col:25}: {filled:3d}/{len(df)} ({percent:5.1f}%)")
            
            # Сохраняем в Excel
            df.to_excel(EXCEL_FILENAME, index=False, engine='openpyxl')
            print(f"\n✅ Данные сохранены в файл: {EXCEL_FILENAME}")
            
        else:
            print("\n❌ Сообщений с данными судов не найдено.")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        await client.disconnect()

if __name__ == '__main__':
    print("="*50)
    print("ПАРСЕР ДАННЫХ СУДОВ ИЗ TELEGRAM")
    print("="*50)
    print("\n1. Собрать все данные")
    print("2. Выход")
    
    choice = input("\nВведите номер действия: ").strip()
    
    if choice == '1':
        asyncio.run(collect_vessels())
    else:
        print("Программа завершена.")