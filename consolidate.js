#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class ProjectConsolidator {
  constructor(projectRoot, outputFile = 'consolidated.txt', targetFolders = ['src'], recursive = true, includeTests = false) {
    this.projectRoot = path.resolve(projectRoot);
    this.outputFile = path.resolve(outputFile);
    this.targetFolders = targetFolders;
    this.recursive = recursive;
    this.includeTests = includeTests;
    this.projectInfo = {};
    
    this.excludeDirs = new Set([
      '.git',
      'node_modules',
      'dist',
      'build',
      '__pycache__',
      '.venv',
      'venv',
    ]);
    
    if (!includeTests) {
      this.excludeDirs.add('tests');
      this.excludeDirs.add('test');
      this.excludeDirs.add('__tests__');
    }
    
    this.excludeFiles = new Set(['.DS_Store']);
  }

  loadProjectInfo() {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log('Warning: package.json not found.');
      return {};
    }
    
    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch (e) {
      console.log(`Error reading package.json: ${e}`);
      return {};
    }
  }

  findFiles() {
    const files = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx'];
    
    const searchPaths = [];
    for (const folder of this.targetFolders) {
      const folderPath = path.join(this.projectRoot, folder);
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        searchPaths.push(folderPath);
        console.log(`Including folder: ${folderPath}`);
      } else {
        console.log(`Warning: Folder not found: ${folderPath}`);
      }
    }
    
    if (searchPaths.length === 0) {
      console.log('No valid target folders found!');
      return [];
    }
    
    const searchDir = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          if (!this.excludeDirs.has(item.name) && this.recursive) {
            searchDir(fullPath);
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name);
          if (extensions.includes(ext) && !this.excludeFiles.has(item.name)) {
            if (!this.includeTests) {
              if (item.name.includes('.test.') || item.name.includes('.spec.')) {
                continue;
              }
            }
            files.push(fullPath);
          }
        }
      }
    };
    
    for (const searchPath of searchPaths) {
      if (this.recursive) {
        searchDir(searchPath);
      } else {
        const items = fs.readdirSync(searchPath, { withFileTypes: true });
        for (const item of items) {
          if (item.isFile()) {
            const ext = path.extname(item.name);
            if (extensions.includes(ext) && !this.excludeFiles.has(item.name)) {
              files.push(path.join(searchPath, item.name));
            }
          }
        }
      }
    }
    
    return this.sortFiles(files);
  }

  sortFiles(files) {
    return files.sort((a, b) => {
      const aName = path.basename(a);
      const bName = path.basename(b);
      
      // __init__ equivalent (index files) first
      if (aName.startsWith('index.') && !bName.startsWith('index.')) return -1;
      if (!aName.startsWith('index.') && bName.startsWith('index.')) return 1;
      
      // Tests last
      const aIsTest = a.includes('test') || a.includes('spec');
      const bIsTest = b.includes('test') || b.includes('spec');
      if (!aIsTest && bIsTest) return -1;
      if (aIsTest && !bIsTest) return 1;
      
      return a.localeCompare(b);
    });
  }

  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf-8').trimEnd();
    } catch (e) {
      console.log(`Error reading ${filePath}: ${e}`);
      return `// Error reading file: ${e}`;
    }
  }

  extractImportsAndExports(content) {
    const lines = content.split('\n');
    const imports = [];
    const exports = [];
    
    for (const line of lines) {
      const stripped = line.trim();
      if (stripped.startsWith('import ') || stripped.startsWith('from ')) {
        imports.push(stripped);
      } else if (stripped.includes('require(')) {
        imports.push(stripped);
      } else if (stripped.startsWith('export ')) {
        const match = stripped.match(/export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/);
        if (match) {
          exports.push(match[1]);
        }
      }
    }
    
    return { imports, exports };
  }

  generateStats(files) {
    const stats = {
      totalFiles: files.length,
      totalLines: 0,
      totalFunctions: 0,
      totalClasses: 0,
      byFolder: {}
    };
    
    for (const filePath of files) {
      const content = this.readFile(filePath);
      const lines = content.split('\n');
      stats.totalLines += lines.length;
      
      for (const line of lines) {
        const stripped = line.trim();
        if (stripped.match(/^(async\s+)?function\s+\w+/) || 
            stripped.match(/^const\s+\w+\s*=\s*(async\s+)?\(/)) {
          stats.totalFunctions++;
        }
        if (stripped.startsWith('class ')) {
          stats.totalClasses++;
        }
      }
      
      const folder = path.dirname(path.relative(this.projectRoot, filePath));
      const folderStr = folder === '.' ? 'root' : folder;
      if (!stats.byFolder[folderStr]) {
        stats.byFolder[folderStr] = 0;
      }
      stats.byFolder[folderStr]++;
    }
    
    return stats;
  }

  createFileHeader(filePath, fileNumber) {
    const relativePath = path.relative(this.projectRoot, filePath);
    const separator = '#' + '='.repeat(79);
    
    return `
${separator}
# FILE #${fileNumber}: ${relativePath}
${separator}
`;
  }

  consolidateFiles() {
    console.log(`Consolidating project: ${this.projectRoot}`);
    console.log(`Target folders: ${this.targetFolders.join(', ')}`);
    console.log(`Recursive: ${this.recursive}`);
    
    this.projectInfo = this.loadProjectInfo();
    const projectName = this.projectInfo.name || 'Unknown Project';
    const projectVersion = this.projectInfo.version || 'Unknown Version';
    const projectDescription = this.projectInfo.description || 'No description available';
    
    const files = this.findFiles();
    
    if (files.length === 0) {
      console.log('No files found!');
      return;
    }
    
    console.log(`Found ${files.length} files`);
    
    const stats = this.generateStats(files);
    
    // Create output directory if needed
    const outputDir = path.dirname(this.outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    let output = '"""\n';
    output += `CONSOLIDATED PROJECT: ${projectName}\n`;
    output += `Version: ${projectVersion}\n`;
    output += `Description: ${projectDescription}\n`;
    output += `Generated from: ${this.projectRoot}\n`;
    output += `Target folders: ${this.targetFolders.join(', ')}\n`;
    output += `Recursive: ${this.recursive}\n`;
    output += `\nStatistics:\n`;
    output += `  Total files: ${stats.totalFiles}\n`;
    output += `  Total lines: ${stats.totalLines.toLocaleString()}\n`;
    output += `  Total functions: ${stats.totalFunctions}\n`;
    output += `  Total classes: ${stats.totalClasses}\n`;
    output += `\nFiles by folder:\n`;
    
    for (const [folder, count] of Object.entries(stats.byFolder).sort()) {
      output += `  ${folder}: ${count} files\n`;
    }
    
    if (this.projectInfo.dependencies) {
      output += `\nDependencies:\n`;
      for (const [dep, version] of Object.entries(this.projectInfo.dependencies)) {
        output += `  - ${dep}: ${version}\n`;
      }
    }
    
    output += '"""\n\n';
    
    // Collect all imports
    const allImports = new Set();
    const fileContents = [];
    
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const fileNumber = i + 1;
      
      console.log(`Processing (${fileNumber}/${files.length}): ${path.basename(filePath)}`);
      
      const content = this.readFile(filePath);
      if (!content.trim()) continue;
      
      const analysis = this.extractImportsAndExports(content);
      analysis.imports.forEach(imp => allImports.add(imp));
      
      fileContents.push({
        path: filePath,
        content: content,
        number: fileNumber,
        analysis: analysis
      });
    }
    
    // Write consolidated imports
    if (allImports.size > 0) {
      output += '# CONSOLIDATED IMPORTS\n';
      output += '# ' + '='.repeat(77) + '\n\n';
      
      const standardImports = [];
      const thirdPartyImports = [];
      const localImports = [];
      
      for (const imp of allImports) {
        if (imp.includes('./') || imp.includes('../')) {
          localImports.push(imp);
        } else if (['fs', 'path', 'http', 'os', 'crypto'].some(mod => imp.includes(mod))) {
          standardImports.push(imp);
        } else {
          thirdPartyImports.push(imp);
        }
      }
      
      if (standardImports.length > 0) {
        output += '# Standard library imports\n';
        standardImports.sort().forEach(imp => output += `${imp}\n`);
        output += '\n';
      }
      
      if (thirdPartyImports.length > 0) {
        output += '# Third-party imports\n';
        thirdPartyImports.sort().forEach(imp => output += `${imp}\n`);
        output += '\n';
      }
      
      if (localImports.length > 0) {
        output += '# Local imports\n';
        localImports.sort().forEach(imp => output += `${imp}\n`);
        output += '\n';
      }
      
      output += '\n';
    }
    
    // Write file contents
    for (const fileInfo of fileContents) {
      output += this.createFileHeader(fileInfo.path, fileInfo.number);
      
      // Remove imports from individual files
      const lines = fileInfo.content.split('\n');
      const filteredLines = [];
      let skipImports = true;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Stop skipping when we hit real code
        if (skipImports && trimmed && 
            !trimmed.startsWith('import ') && 
            !trimmed.startsWith('//') &&
            !trimmed.includes('require(')) {
          skipImports = false;
        }
        
        if (!skipImports || (!trimmed.startsWith('import ') && !trimmed.includes('require('))) {
          filteredLines.push(line);
        }
      }
      
      const filteredContent = filteredLines.join('\n').trim();
      if (filteredContent) {
        output += '\n' + filteredContent + '\n';
      }
      
      output += '\n';
    }
    
    fs.writeFileSync(this.outputFile, output, 'utf-8');
    
    console.log(`\nConsolidation complete!`);
    console.log(`Output saved to: ${this.outputFile}`);
    console.log(`Total files processed: ${stats.totalFiles}`);
    console.log(`Total lines: ${stats.totalLines.toLocaleString()}`);
  }
}

// Run function with hardcoded values (like the Python script)
function run() {
  const projectPath = '.';
  const folders = ['components', 'content', 'pages'];  // Change this to your folders
  const recursive = true;
  const includeTests = false;
  const outputFile = 'consolidated.txt';
  
  const consolidator = new ProjectConsolidator(
    projectPath,
    outputFile,
    folders,
    recursive,
    includeTests
  );
  
  try {
    consolidator.consolidateFiles();
  } catch (e) {
    console.log(`\nOperation cancelled or error: ${e}`);
  }
}

run();