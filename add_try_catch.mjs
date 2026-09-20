import fs from 'fs';
import path from 'path';

const fp = path.resolve('src/pages/sales/SalesPipelinePage.tsx');
let code = fs.readFileSync(fp, 'utf8');

const dropSearch = `const handleDrop = async (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    let card = draggedCard || cards.find(c => String(c.id) === String(cardId));
    if (!card) {
      alert("Error: Could not identify the dragged card. Please try again.");
      return;
    }
    if (card.stage === toStage) return;`;

const dropReplace = `const handleDrop = async (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    let card = draggedCard || cards.find(c => String(c.id) === String(cardId));
    if (!card) {
      alert("Error: Could not identify the dragged card. Please try again.");
      return;
    }
    if (card.stage === toStage) return;
    
    try {`;

code = code.replace(dropSearch, dropReplace);

const endSearch = `      } else {
         alert(\`Cannot drag \${card.stage} directly to \${toStage}. Please follow the sequence.\`);
      }
    }
  };`;

const endReplace = `      } else {
         alert(\`Cannot drag \${card.stage} directly to \${toStage}. Please follow the sequence.\`);
      }
    }
    } catch(err: any) {
      alert("Runtime Error in handleDrop: " + err.message);
    }
  };`;

code = code.replace(endSearch, endReplace);

fs.writeFileSync(fp, code, 'utf8');
console.log('Added try-catch to handleDrop');
