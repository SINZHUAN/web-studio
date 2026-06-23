'use strict'
/**
 * HTTP触发器包装层 - 自动注入JWT验证和CORS支持
 * 由 web-studio 工具自动生成，请勿手动修改此头部
 */
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'studio_jwt_secret_2026_please_change';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};
function _httpRespond(statusCode, data) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

// cloudfunctions_clo/word_processor_clo/index.js
// Word文档处理云函数 - 使用真正的Word模板文件和腾讯云数据万象文档预览功能

// ============================================
// 云函数全局日志控制开关（唯一配置入口）
// ============================================
const ENABLE_CLOUD_DEBUG_LOG = true  // ← 改这里！生产环境建议 false
// ============================================
// true  = 开启日志（开发/调试环境）- 帮助定位问题，但会影响性能
// false = 关闭日志（生产环境）- 提升性能 30-50%，减少冷启动时间
// 
// 说明：
// - console.log/info: 受此开关控制
// - console.warn/error: 始终输出（用于异常告警）
// ============================================

// 应用全局日志控制（使用 Object.defineProperty 深度劫持）
if (!ENABLE_CLOUD_DEBUG_LOG) {
  const noop = () => {}
  
  // 保存原始方法（用于 warn 和 error）
  const originalWarn = console.warn
  const originalError = console.error
  
  // 使用 Object.defineProperty 深度劫持 console.log 和 console.info
  Object.defineProperty(console, 'log', {
    value: noop,
    writable: false,
    configurable: false
  })
  
  Object.defineProperty(console, 'info', {
    value: noop,
    writable: false,
    configurable: false
  })
  
  // 确保 warn 和 error 保持不变
  console.warn = originalWarn
  console.error = originalError
}

const cloud = require('wx-server-sdk')
const COS = require('cos-nodejs-sdk-v5')
const axios = require('axios')
const crypto = require('crypto')
const Docxtemplater = require('docxtemplater')
const PizZip = require('pizzip')
const sizeOf = require('image-size')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 工具函数：从完整模板ID中提取基础ID
 * 支持用户身份后缀处理
 * @param {string} templateId - 完整模板ID（如 'word_a_1_work' 或 'word_a_1'）
 * @returns {string} 基础模板ID（如 'word_a_1'）
 */
function getBaseTemplateId(templateId) {
  if (!templateId) return templateId
  
  // 移除用户身份后缀 (_work 或 _internship 或 _student)
  return templateId.replace(/_work$|_internship$|_student$/, '')
}

// ========== 识别创建模式云存储配置（独立新增，不影响其他功能）==========
// web-2 云存储环境的 cloudFileId 前缀
// 格式：cloud://{envId}.{bucketName}
const WEB2_CLOUD_FILE_PREFIX = 'cloud://jiandacom-prod-d2gnxqxs93455d5d7.6a69-jiandacom-prod-d2gnxqxs93455d5d7-1340279912'

/**
 * 判断是否为识别模式专属模板（word_r_1 ~ word_r_5）
 */
function isRecognitionTemplate(templateId) {
  const base = getBaseTemplateId(templateId || '')
  return /^word_r_\d+$/.test(base)
}

/**
 * 构建识别模式模板在 web-2 云存储中的 cloudFileId
 * 路径规则：template_all/template_{userType}_word/r_{n}.docx
 */
function buildRecognitionTemplateCloudId(templateId, userType) {
  const base = getBaseTemplateId(templateId)       // word_r_1
  const tplName = base.replace('word_', '')        // r_1
  const folder = `template_all/template_${userType || 'work'}_word`
  return `${WEB2_CLOUD_FILE_PREFIX}/${folder}/${tplName}.docx`
}
// ================================================================

/**
 * 预处理阶段：为图片占位符分配特殊标识
 * 在docxtemplater处理之前，找到图片占位符并给它们分配特殊的标识符
 */
async function assignPhotoPlaceholderKeys(zip, templateId = null) {
  try {
    console.log('查找并标记图片占位符')
    
    const placeholderNames = [
      'placeholder.jpg', 'placeholder.png', 'placeholder.jpeg',
      '证件照.jpg', '证件照.png', '证件照.jpeg',
      'photo.jpg', 'photo.png', 'photo.jpeg',
      'avatar.jpg', 'avatar.png', 'avatar.jpeg'
    ]
    
    // 模板特定的证件照位置配置
    const templateSpecificConfig = {
      'word_a_10': {
        preferredImages: ['image4.jpeg', 'image3.png', 'image2.png'], // a_10模板中更可能是证件照的图片
        avoidImages: ['image1.png'], // 避开这些装饰图标
        description: 'a_10模板：避开装饰图标，优先选择中后位置的图片'
      },
      'word_a_8': {
        preferredImages: ['image1.jpeg', 'image2.png', 'image3.png'], // a_8模板中更可能是证件照的图片
        avoidImages: ['image6.png', 'image10.png'], // 避开背景图片和大尺寸装饰图
        maxFileSize: 20000, // 避开超过20KB的大图片（通常是背景）
        description: 'a_8模板：避开背景图片，优先选择小尺寸证件照位置'
      },
      'word_a_19': {
        preferredImages: ['image1.png'], // 重新分析：image1.png（5KB）可能是真正的证件照位置
        avoidImages: ['image2.png', 'image3.png', 'image4.png', 'image5.png', 'image6.png'], // 避开背景图和所有小图标
        maxFileSize: 15000, // 避开超过15KB的大图片
        minFileSize: 3000, // 提高最小文件大小到3KB，确保不是小图标
        description: 'a_19模板：重新分析后，image1.png可能是真正的证件照位置，其他都是小图标'
      },
      'word_a_1': {
        preferredImages: ['placeholder.jpg', 'photo.jpg'],
        avoidImages: ['image1.png', 'icon1.png'],
        description: 'a_1模板配置'
      },
      'word_c_9': {
        preferredImages: ['image3.jpeg'], // 根据日志，image3.jpeg看起来是最大的图片，可能是证件照占位符
        avoidImages: ['image1.png', 'image2.png', 'image4.png', 'image5.png', 'image6.png', 'image7.png', 'image8.png', 'image9.png', 'image10.png'], // 避开所有小图标
        maxFileSize: 50000, // 证件照通常比小图标大
        description: 'c_9模板：避开小图标，优先选择image3.jpeg作为证件照占位符'
      },
      'word_c_11': {
        preferredImages: ['image1.jpeg'], // 从日志看image1.jpeg是7573字节，应该是证件照占位符
        avoidImages: ['image2.png'], // 避开image2.png，它是26020字节的背景图片
        maxFileSize: 15000, // 证件照通常比背景图片小
        description: 'c_11模板：避开image2.png背景图片，优先选择image1.jpeg作为证件照占位符'
      },

      // 可以继续为其他模板添加配置
    }
    
    let foundPlaceholders = []
    
    // 遍历word/media/目录查找所有占位图片 - 使用PizZip的正确方法
    const fileNames = Object.keys(zip.files)
    console.log('ZIP文件列表:', fileNames.filter(name => name.startsWith('word/media/')))
    
    if (templateId) {
      console.log(`当前模板: ${templateId}`)
    }
    
    // 第一步：查找标准命名的占位符
    for (const relativePath of fileNames) {
      if (relativePath.startsWith('word/media/')) {
        const fileName = relativePath.split('/').pop().toLowerCase()
        
        // 检查是否是占位图片
        for (const placeholder of placeholderNames) {
          if (fileName.includes(placeholder.toLowerCase()) || fileName === placeholder.toLowerCase()) {
            foundPlaceholders.push({
              path: relativePath,
              fileName: fileName,
              originalName: relativePath.split('/').pop(),
              priority: 10, // 标准命名的优先级最高
              isStandardNamed: true
            })
            console.log('发现标准命名的图片占位符:', relativePath)
            break
          }
        }
      }
    }
    
    // 第二步：如果没找到标准命名的，智能选择可能的证件照位置
    if (foundPlaceholders.length === 0) {
      console.log('未找到标准命名的占位符，开始智能分析...')
      
      const allImages = []
      for (const relativePath of fileNames) {
        if (relativePath.startsWith('word/media/') && /\.(jpg|jpeg|png|gif)$/i.test(relativePath)) {
          const fileName = relativePath.split('/').pop()
          const zipEntry = zip.files[relativePath]
          
          if (zipEntry && !zipEntry.dir) {
            // 获取图片文件大小作为参考
            const fileSize = zipEntry._data ? zipEntry._data.uncompressedSize || 0 : 0
            
            allImages.push({
            path: relativePath,
              fileName: fileName.toLowerCase(),
              originalName: fileName,
              fileSize: fileSize,
              priority: 0,
              isStandardNamed: false
            })
          }
        }
      }
      
      console.log(`发现 ${allImages.length} 个图片文件`)
      
      if (allImages.length > 0) {
        // 获取当前模板的特定配置（支持用户身份后缀）
        const baseTemplateId = getBaseTemplateId(templateId)
        const currentConfig = templateSpecificConfig[baseTemplateId] || {}
        console.log(`模板ID: ${templateId}, 基础ID: ${baseTemplateId}`)
        console.log(`应用模板配置: ${currentConfig.description || '使用通用配置'}`)
        
        // 智能选择证件照的策略
        allImages.forEach((img, index) => {
          let priority = 0
          
          // 策略1：模板特定配置 - 最高优先级
          if (currentConfig.preferredImages) {
            if (currentConfig.preferredImages.some(preferred => img.originalName.toLowerCase().includes(preferred.toLowerCase()))) {
              priority += 15
              console.log(`${img.originalName} 匹配模板首选图片，优先级+15`)
            }
          }
          
          if (currentConfig.avoidImages) {
            if (currentConfig.avoidImages.some(avoid => img.originalName.toLowerCase().includes(avoid.toLowerCase()))) {
              priority -= 10
              console.log(`${img.originalName} 在避免列表中，优先级-10`)
            }
          }
          
          // 策略1.5：文件大小限制 - 避开背景图片
          if (currentConfig.maxFileSize && img.fileSize > currentConfig.maxFileSize) {
            priority -= 15
            console.log(`${img.originalName} 文件过大(${img.fileSize}>${currentConfig.maxFileSize})，很可能是背景图，优先级-15`)
          }
          
          // 策略1.6：文件大小限制 - 避开小图标
          if (currentConfig.minFileSize && img.fileSize < currentConfig.minFileSize) {
            priority -= 12
            console.log(`${img.originalName} 文件过小(${img.fileSize}<${currentConfig.minFileSize})，很可能是小图标，优先级-12`)
          }
          
          // 策略2：根据文件名判断（可能是证件照的关键词）
          const nameKeywords = ['image1', 'img1', 'pic1', 'photo1', 'avatar1', 'head', 'portrait']
          if (nameKeywords.some(keyword => img.fileName.includes(keyword))) {
            priority += 5
          }
          
          // 策略3：文件位置策略 - 倾向于选择后面的图片（通常证件照在模板后面添加）
          if (index >= Math.floor(allImages.length / 2)) {
            priority += 3
          }
          
          // 策略4：文件大小策略 - 证件照通常比图标大，但不会太大
          if (img.fileSize > 5000 && img.fileSize < 50000) { // 5KB-50KB之间比较合适
            priority += 2
          } else if (img.fileSize > 50000) {
            // 超过50KB的图片很可能是背景图，降低优先级
            priority -= 5
          }
          
          // 策略5：通用策略 - 避开image1（通常是装饰图标）
          if (img.fileName.includes('image') && !img.fileName.includes('image1')) {
            priority += 4
          }
          
          // 策略6：jpeg格式通常更可能是照片
          if (img.fileName.includes('.jpeg') || img.fileName.includes('.jpg')) {
            priority += 1
          }
          
          img.priority = priority
        })
        
        // 按优先级排序，选择最高优先级的
        allImages.sort((a, b) => b.priority - a.priority)
        
        console.log('图片优先级分析结果:')
        allImages.forEach(img => {
          console.log(`- ${img.originalName}: 优先级=${img.priority}, 大小=${img.fileSize}`)
        })
        
        // 选择优先级最高的作为证件照占位符
        const selectedImage = allImages[0]
        foundPlaceholders.push(selectedImage)
        
        console.log(`智能选择证件照占位符: ${selectedImage.originalName} (优先级: ${selectedImage.priority})`)
      }
    }
    
    if (foundPlaceholders.length === 0) {
      console.log('未找到任何图片占位符')
      return { success: false }
    }
    
    console.log(`最终选择 ${foundPlaceholders.length} 个图片占位符`)
    
    // 给占位符分配唯一标识
    const timestamp = Date.now()
    const photoPlaceholderInfo = {
      success: true,
      primaryPlaceholder: foundPlaceholders[0],
      allPlaceholders: foundPlaceholders,
      timestamp: timestamp,
      uniqueMarker: `PHOTO_MARKER_${timestamp}`,
      selectionMethod: foundPlaceholders[0].isStandardNamed ? 'standard_naming' : 'intelligent_selection',
      templateId: templateId
    }
    
    console.log(`占位符选择方法: ${photoPlaceholderInfo.selectionMethod}`)
    
    return photoPlaceholderInfo
    
  } catch (error) {
    console.error('预处理图片占位符失败:', error)
    return { success: false }
  }
}

/**
 * 使用预处理信息替换图片占位符
 */
async function replacePhotoWithPlaceholderInfo(zip, templateData, photoPlaceholderInfo) {
  try {
    console.log('使用预处理信息替换图片占位符')
    
    const photoUrl = templateData['基本_证件照']
    if (!photoUrl || photoUrl.trim() === '') {
      console.log('无证件照URL，保持原占位图片')
      return zip
    }
    
    // 1. 下载用户证件照
    const imageBuffer = await downloadImageFromUrl(photoUrl)
    if (!imageBuffer) {
      console.error('证件照下载失败，保持原占位图片')
      return zip
    }
    
    console.log('证件照下载成功，开始替换图片占位符')
    
    // 2. 替换主要占位图片
    const primaryPlaceholder = photoPlaceholderInfo.primaryPlaceholder
    console.log(`替换主要占位图片: ${primaryPlaceholder.path}`)
    
    zip.file(primaryPlaceholder.path, imageBuffer)
    
    // 3. 删除其他多余的占位图片
    if (photoPlaceholderInfo.allPlaceholders.length > 1) {
      console.log(`开始删除 ${photoPlaceholderInfo.allPlaceholders.length - 1} 个多余的占位图片`)
      
      for (let i = 1; i < photoPlaceholderInfo.allPlaceholders.length; i++) {
        const placeholderToRemove = photoPlaceholderInfo.allPlaceholders[i]
        console.log(`删除多余占位图片: ${placeholderToRemove.path}`)
        
        // 从ZIP中删除文件
        zip.remove(placeholderToRemove.path)
        
        // 清理相关引用
        await removeImageReferences(zip, placeholderToRemove.path)
      }
      
      console.log('多余占位图片删除完成')
    }
    
    // 4. 更新Content-Types
    const originalExtension = primaryPlaceholder.path.split('.').pop().toLowerCase()
    const newImageFormat = originalExtension === 'png' ? 'png' : 'jpg'
    await updateContentTypes(zip, primaryPlaceholder.path, newImageFormat)
    
    console.log('图片占位符替换完成')
    return zip
    
  } catch (error) {
    console.error('使用预处理信息替换图片失败:', error)
    return zip
  }
}

/**
 * 新的图片占位符处理方案 - 直接替换Word模板中的占位图片
 * 支持从URL下载图片并替换模板中的占位图片
 */
async function processPhotoInWordTemplate(zip, templateData) {
  try {
    console.log('开始处理证件照（图片占位符方式）')
    
    const photoUrl = templateData['基本_证件照']
    if (!photoUrl || photoUrl.trim() === '') {
      console.log('无证件照URL，保持原占位图片')
      return zip
    }
    
    console.log('下载证件照中...')
    
    // 1. 下载用户证件照
    const imageBuffer = await downloadImageFromUrl(photoUrl)
    if (!imageBuffer) {
      console.error('证件照下载失败，保持原占位图片')
      return zip
    }
    
    console.log('证件照下载成功，开始替换占位图片')
    
    // 2. 查找并替换占位图片
    const success = await replacePlaceholderImage(zip, imageBuffer)
    
    if (success) {
      console.log('证件照图片替换完成')
    } else {
      console.log('未找到占位图片，尝试降级为文本占位符处理')
      // 降级处理：如果没有找到图片占位符，尝试原来的文本占位符方式
      return await processPhotoWithTextPlaceholder(zip, templateData)
    }
    
    return zip
    
  } catch (error) {
    console.error('证件照处理失败:', error.message)
    console.log('尝试降级为文本占位符处理')
    return await processPhotoWithTextPlaceholder(zip, templateData)
  }
}

/**
 * 替换Word模板中的占位图片并清理多余占位符
 * 查找特定命名的占位图片并替换为用户证件照，同时删除其他占位图片
 */
async function replacePlaceholderImage(zip, newImageBuffer) {
  try {
    // 1. 查找所有占位图片文件
    const placeholderNames = [
      'placeholder.jpg', 'placeholder.png', 'placeholder.jpeg',
      '证件照.jpg', '证件照.png', '证件照.jpeg',
      'photo.jpg', 'photo.png', 'photo.jpeg',
      'avatar.jpg', 'avatar.png', 'avatar.jpeg'
    ]
    
    let allPlaceholders = []
    let primaryPlaceholder = null
    let primaryPath = null
    
         // 遍历word/media/目录查找所有占位图片 - 使用PizZip的正确方法
     const fileNames = Object.keys(zip.files)
     
     for (const relativePath of fileNames) {
       if (relativePath.startsWith('word/media/')) {
         const fileName = relativePath.split('/').pop().toLowerCase()
         const zipEntry = zip.files[relativePath]
         
         // 检查是否是占位图片
         for (const placeholder of placeholderNames) {
           if (fileName.includes(placeholder.toLowerCase()) || fileName === placeholder.toLowerCase()) {
             const placeholderInfo = {
               path: relativePath,
               entry: zipEntry,
               fileName: fileName
             }
             
             allPlaceholders.push(placeholderInfo)
             
             // 选择第一个作为主要占位符进行替换
             if (!primaryPlaceholder) {
               primaryPlaceholder = zipEntry
               primaryPath = relativePath
             }
             
             console.log('发现占位图片:', relativePath)
             break
           }
         }
       }
     }
     
     console.log(`总共发现 ${allPlaceholders.length} 个占位图片`)
     
     // 2. 如果没有找到特定命名的占位图片，查找第一个图片文件作为占位符
     if (allPlaceholders.length === 0) {
       console.log('未找到特定命名的占位图片，查找第一个图片文件')
       for (const relativePath of fileNames) {
         if (relativePath.startsWith('word/media/') && /\.(jpg|jpeg|png|gif)$/i.test(relativePath)) {
           const zipEntry = zip.files[relativePath]
           primaryPlaceholder = zipEntry
           primaryPath = relativePath
           allPlaceholders.push({
             path: relativePath,
             entry: zipEntry,
             fileName: relativePath.split('/').pop().toLowerCase()
           })
           console.log('使用第一个找到的图片作为占位符:', relativePath)
           break // 跳出循环
         }
       }
     }
    
    if (!primaryPlaceholder) {
      console.log('文档中没有找到任何图片文件，无法进行图片替换')
      return false
    }
    
    // 3. 替换主要占位图片
    const originalExtension = primaryPath.split('.').pop().toLowerCase()
    let newImageFormat = 'jpg' // 默认使用jpg格式
    
    // 如果原图是png，保持png格式
    if (originalExtension === 'png') {
      newImageFormat = 'png'
    }
    
    console.log(`替换主要占位图片: ${primaryPath} -> 新的证件照 (${newImageFormat}格式)`)
    zip.file(primaryPath, newImageBuffer)
    
    // 4. 删除其他多余的占位图片
    if (allPlaceholders.length > 1) {
      console.log(`开始清理 ${allPlaceholders.length - 1} 个多余的占位图片`)
      
      for (let i = 1; i < allPlaceholders.length; i++) {
        const placeholderToRemove = allPlaceholders[i]
        console.log(`删除多余占位图片: ${placeholderToRemove.path}`)
        
        // 从ZIP中删除文件
        zip.remove(placeholderToRemove.path)
        
        // 同时需要清理相关的关系引用
        await removeImageReferences(zip, placeholderToRemove.path)
      }
      
      console.log('多余占位图片清理完成')
    }
    
    // 5. 更新content-types (如果格式发生变化)
    await updateContentTypes(zip, primaryPath, newImageFormat)
    
    console.log('占位图片替换和清理完成')
    return true
    
  } catch (error) {
    console.error('替换占位图片失败:', error)
    return false
  }
}

/**
 * 清理被删除图片的相关引用
 */
async function removeImageReferences(zip, imagePath) {
  try {
    const fileName = imagePath.split('/').pop()
    const mediaPath = imagePath.replace('word/', '')
    
    // 1. 从document.xml.rels中删除相关关系
    const relsPath = 'word/_rels/document.xml.rels'
    let relsContent = zip.file(relsPath)?.asText()
    
    if (relsContent) {
      // 查找并删除指向该图片的关系
      const relationshipRegex = new RegExp(`<Relationship[^>]*Target="${mediaPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`, 'g')
      const updatedRelsContent = relsContent.replace(relationshipRegex, '')
      
      if (updatedRelsContent !== relsContent) {
        zip.file(relsPath, updatedRelsContent)
        console.log(`已从关系文件中清理图片引用: ${fileName}`)
      }
    }
    
    // 2. 从document.xml中删除相关的图片引用
    const docPath = 'word/document.xml'
    let docContent = zip.file(docPath)?.asText()
    
    if (docContent) {
      // 这里可以添加更复杂的XML解析来删除图片引用
      // 简单方案：如果文档中有明显的图片引用且包含文件名，则尝试清理
      if (docContent.includes(fileName.replace(/\.[^.]+$/, ''))) {
        console.log(`文档中可能包含对 ${fileName} 的引用，建议手动检查`)
      }
    }
    
  } catch (error) {
    console.error('清理图片引用失败:', error)
  }
}

/**
 * 更新[Content_Types].xml文件中的MIME类型
 */
async function updateContentTypes(zip, imagePath, imageFormat) {
  try {
    const contentTypesPath = '[Content_Types].xml'
    let contentTypesXml = zip.file(contentTypesPath)?.asText()
    
    if (contentTypesXml) {
      const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg'
      const extension = imageFormat === 'png' ? 'png' : 'jpg'
      
      // 检查是否已经存在对应扩展名的MIME类型定义
      const extensionDefExists = contentTypesXml.includes(`Extension="${extension}"`)
      
      if (!extensionDefExists) {
        // 添加扩展名的MIME类型定义
        const newExtensionDef = `<Default Extension="${extension}" ContentType="${mimeType}"/>`
        contentTypesXml = contentTypesXml.replace(
          '</Types>',
          `  ${newExtensionDef}\n</Types>`
        )
        
        zip.file(contentTypesPath, contentTypesXml)
        console.log(`已更新Content-Types.xml，添加${extension}格式支持`)
      }
    }
  } catch (error) {
    console.error('更新Content-Types失败:', error)
  }
}

/**
 * 降级处理：使用原来的文本占位符方式处理证件照
 */
async function processPhotoWithTextPlaceholder(zip, templateData) {
  try {
    console.log('使用文本占位符方式处理证件照')
    
    const photoUrl = templateData['基本_证件照']
    if (!photoUrl || photoUrl.trim() === '') {
      console.log('无证件照URL，跳过图片处理')
      return zip
    }
    
    // 1. 下载图片
    const imageBuffer = await downloadImageFromUrl(photoUrl)
    if (!imageBuffer) {
      console.error('证件照下载失败')
      return replacePhotoPlaceholderWithText(zip, '[证件照下载失败]')
    }
    
    console.log('证件照下载成功')
    
    // 2. 获取图片信息
    const dimensions = sizeOf(imageBuffer)
    
    // 3. 生成唯一标识符
    const timestamp = Date.now()
    const randomId = Math.floor(Math.random() * 10000)
    const imageId = `${timestamp}${randomId}`
    const rId = `rId${timestamp}`
    
    // 4. 将图片添加到Word文档的媒体文件夹
    const imagePath = `word/media/image${imageId}.jpg`
    zip.file(imagePath, imageBuffer)
    console.log('图片添加到ZIP:', imagePath)
    
    // 5. 更新关系文件
    addImageRelationshipToZip(zip, rId, `media/image${imageId}.jpg`)
    
    // 6. 生成图片XML并替换占位符
    const imageXml = generatePhotoXml(rId, imageId, dimensions)
    replacePhotoPlaceholderInDocument(zip, imageXml)
    
    console.log('文本占位符证件照处理完成')
    return zip
    
  } catch (error) {
    console.error('文本占位符证件照处理失败:', error.message)
    return replacePhotoPlaceholderWithText(zip, '[证件照处理失败]')
  }
}

/**
 * 下载图片
 */
async function downloadImageFromUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.status === 200 && response.data) {
      return Buffer.from(response.data)
    } else {
      console.error('图片下载失败，状态码:', response.status)
      return null
    }
  } catch (error) {
    console.error('下载图片出错:', error.message)
    return null
  }
}

/**
 * 生成证件照的XML结构
 */
function generatePhotoXml(rId, imageId, dimensions) {
  // 根据实际上传的证件照比例 (254×381) 设置合适的显示尺寸
  // 保持原图比例，但缩放到合适的文档显示大小
  const originalRatio = 381 / 254 // 约1.5，高度是宽度的1.5倍
  const targetWidthEmu = 120 * 9525 // 120像素宽度
  const targetHeightEmu = Math.round(120 * originalRatio) * 9525 // 约180像素高度
  
  // 使用完整的Word图片XML格式，包含所有必要的命名空间
  return `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:drawing>
      <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${targetWidthEmu}" cy="${targetHeightEmu}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${imageId}" name="证件照"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="${imageId}" name="证件照"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>
                <a:stretch>
                  <a:fillRect/>
                </a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${targetWidthEmu}" cy="${targetHeightEmu}"/>
                </a:xfrm>
                <a:prstGeom prst="rect">
                  <a:avLst/>
                </a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>`
}

/**
 * 添加图片关系到ZIP文件
 */
function addImageRelationshipToZip(zip, rId, target) {
  try {
    const relsPath = 'word/_rels/document.xml.rels'
    let relsContent = zip.file(relsPath)?.asText()
    
    if (!relsContent) {
      // 创建基础的rels文件
      relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
    }
    
    // 检查rId是否已存在，如果存在则跳过
    if (relsContent.includes(`Id="${rId}"`)) {
      console.log('关系ID已存在，跳过添加:', rId)
      return
    }
    
    // 添加图片关系
    const imageRelationship = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`
    
    // 插入到最后一个</Relationships>之前
    const updatedRelsContent = relsContent.replace(
      '</Relationships>', 
      `  ${imageRelationship}\n</Relationships>`
    )
    
    // 更新rels文件
    zip.file(relsPath, updatedRelsContent)
    console.log('图片关系添加成功:', rId, '->', target)
    
  } catch (error) {
    console.error('添加图片关系失败:', error.message)
  }
}

/**
 * 在document.xml中替换证件照占位符
 */
function replacePhotoPlaceholderInDocument(zip, imageXml) {
  try {
    const docPath = 'word/document.xml'
    let docContent = zip.file(docPath)?.asText()
    
    if (docContent) {
      // 查找并替换特殊标记（docxtemplater已经把{{基本_证件照}}替换为这个标记了）
      const photoMarker = '{{PHOTO_PLACEHOLDER_WILL_BE_REPLACED}}'
      
      // 调试：检查文档中是否包含我们的特殊标记
      const hasPhotoMarker = docContent.includes(photoMarker)
      const hasBasicPhoto = docContent.includes('基本_证件照')
      const hasAnyPhotoText = docContent.includes('证件照')
      
      console.log('文档占位符检查:')
      console.log('- 包含特殊标记:', hasPhotoMarker)
      console.log('- 包含"基本_证件照":', hasBasicPhoto)
      console.log('- 包含"证件照"文本:', hasAnyPhotoText)
      
      if (hasPhotoMarker) {
        const beforeLength = docContent.length
        docContent = docContent.replace(new RegExp(escapeRegExp(photoMarker), 'g'), imageXml)
        const afterLength = docContent.length
        zip.file(docPath, docContent)
        console.log('证件照特殊标记替换成功')
        console.log('文档内容长度变化:', beforeLength, '->', afterLength)
        console.log('插入的图片XML长度:', imageXml.length)
      } else {
        console.log('未找到证件照特殊标记')
        
        // 如果没有找到特殊标记，尝试查找原始占位符（降级处理）
        const originalPlaceholder = '{{基本_证件照}}'
        if (docContent.includes(originalPlaceholder)) {
          console.log('⚡ 找到原始占位符，进行降级替换')
          docContent = docContent.replace(new RegExp(escapeRegExp(originalPlaceholder), 'g'), imageXml)
          zip.file(docPath, docContent)
          console.log('证件照原始占位符替换成功')
        } else {
          console.log('完全找不到任何证件照相关标记')
        }
      }
    } else {
      console.log('无法获取文档内容')
    }
  } catch (error) {
    console.error('替换证件照占位符失败:', error)
  }
}

/**
 * 用文本替换证件照占位符（降级方案）
 */
function replacePhotoPlaceholderWithText(zip, text) {
  try {
    const docPath = 'word/document.xml'
    let docContent = zip.file(docPath)?.asText()
    
    if (docContent) {
      const placeholder = '{{基本_证件照}}'
      if (docContent.includes(placeholder)) {
        docContent = docContent.replace(new RegExp(escapeRegExp(placeholder), 'g'), text)
        zip.file(docPath, docContent)
        console.log('证件照占位符已替换为文本:', text)
      }
    }
    return zip
  } catch (error) {
    console.error('替换证件照文本失败:', error)
    return zip
  }
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 在文档开头插入证件照（当模板没有占位符时使用）
 */
async function insertPhotoAtBeginning(zip, templateData) {
  try {
    console.log('在文档开头插入证件照')
    
    const photoUrl = templateData['基本_证件照']
    if (!photoUrl || photoUrl.trim() === '') {
      console.log('无证件照URL，跳过图片处理')
      return zip
    }
    
    // 1. 下载图片
    const imageBuffer = await downloadImageFromUrl(photoUrl)
    if (!imageBuffer) {
      console.error('证件照下载失败')
      return zip
    }
    
    console.log('证件照下载成功')
    
    // 2. 获取图片信息
    const dimensions = sizeOf(imageBuffer)
    
    // 3. 生成唯一标识符
    const timestamp = Date.now()
    const randomId = Math.floor(Math.random() * 10000)
    const imageId = `${timestamp}${randomId}`
    const rId = `rId${timestamp}`
    
    // 4. 将图片添加到Word文档的媒体文件夹
    const imagePath = `word/media/image${imageId}.jpg`
    zip.file(imagePath, imageBuffer)
    console.log('图片添加到ZIP:', imagePath)
    
    // 5. 更新关系文件
    addImageRelationshipToZip(zip, rId, `media/image${imageId}.jpg`)
    
    // 6. 在文档开头插入图片
    const docPath = 'word/document.xml'
    let docContent = zip.file(docPath)?.asText()
    
    if (docContent) {
      // 生成图片XML
      const imageXml = generatePhotoXml(rId, imageId, dimensions)
      
      // 查找第一个段落并在其前面插入图片
      const firstParagraphMatch = docContent.match(/<w:p[^>]*>/)
      if (firstParagraphMatch) {
        const insertPosition = firstParagraphMatch.index
        const beforeContent = docContent.substring(0, insertPosition)
        const afterContent = docContent.substring(insertPosition)
        
      // 插入图片段落（作为独立段落）
         const photoXmlWrapped = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${imageXml}</w:p>`
         const newDocContent = beforeContent + photoXmlWrapped + afterContent
        
        zip.file(docPath, newDocContent)
        console.log('证件照已插入文档开头')
      } else {
        console.log('无法找到合适的插入位置')
      }
    }
    
    return zip
    
  } catch (error) {
    console.error('在文档开头插入证件照失败:', error.message)
    return zip
  }
}

const db = cloud.database()

// 腾讯云配置 
const config = {
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY,
  region: process.env.TENCENT_REGION || 'ap-shanghai',
  bucket: process.env.TENCENT_BUCKET || 'cloud1-4g7z1dndd718b661-1340279912'   // 数据万象 CI 桶，非云开发默认存储
}



/**
 * 云函数入口函数
 */
async function _handleAction(event, context) {
  const wxContext = cloud.getWXContext()
  
  
  try {
    const { action } = event
    
    switch (action) {
      case 'generatePreview':
        return await generatePreview(event)
      case 'generatePreviewWithTemplateData':
        return await generatePreviewWithTemplateData(event)
      case 'generateResume':
        return await generateResume(event)
      case 'generatePDF':
        return await generatePDF(event)
      case 'downloadTemplate':
        return await downloadTemplate(event)
      case 'getTempDownloadUrl':
        return await getTempDownloadUrl(event)
      case 'extractText':
        return await extractWordText(event)
      case 'cleanupCOSFiles':
        return await cleanupCOSFiles(event)
      case 'recognizeJD':
        return await recognizeJDFromImage(event)
      // ========== 简历优化功能（独立新增，不影响其他功能）==========
      case 'extractParagraphs':
        return await extractParagraphs(event)
      case 'docToImage':
        return await docToImage(event)
      case 'replaceByParagraph':
        return await replaceByParagraph(event)
      // ================================================================

      // ========== 识别创建模式（独立新增，不影响其他功能）==========
      case 'getRecognitionTemplateUrls':
        return await getRecognitionTemplateUrls(event)
      // ========== PDF 转 Word（独立新增，不影响其他功能）==========
      case 'pdfToDocx':
        return await pdfToDocx(event)
      // ================================================================

      default:
        throw new Error('未知的操作类型: ' + action)
    }
  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 下载简历Word模板文件
 */
async function downloadTemplate(event) {
  try {
    const { templateId, userType } = event
    
    console.log('下载Word模板:', templateId, '用户身份:', userType)
    
    // 构建Word模板文件路径 - 根据用户身份选择对应的文件夹
    let wordFolder = 'model_word' // 默认路径（向后兼容）
    
    // 根据用户身份确定模板文件夹
    if (userType === 'work') {
      wordFolder = 'model_word_work'
    } else if (userType === 'internship') {
      wordFolder = 'model_word_internship'
    } else if (userType === 'student') {
      wordFolder = 'model_word_students'
    } else if (userType) {
      console.warn('未知的用户身份类型:', userType, '使用默认路径')
    }
    
    // 使用getBaseTemplateId函数正确解析模板ID
    const baseTemplateId = getBaseTemplateId(templateId)

    // ── 识别模式专属模板（r_* 系列）使用 web-2 云存储路径 ──────────────────
    // ⚠️  降级规则：当目标 userType 的模板不存在时，自动回退到 internship/r_1
    //     上架新模板后无需修改此处，云存储有对应文件即自动生效
    let cloudFileId
    let recognitionTemplateFallback = false  // 标记是否已触发降级
    if (isRecognitionTemplate(templateId)) {
      cloudFileId = buildRecognitionTemplateCloudId(templateId, userType)
      console.log('识别模式模板（web-2路径）:', cloudFileId)
    } else {
      // 原有逻辑：a_* / c_* 系列模板使用小程序 cloud2 云存储
      const templatePath = `model/${wordFolder}/${baseTemplateId.replace('word_', '')}.docx`
      cloudFileId = `cloud://cloud2-2giceoll88a02-3b3b3dcd374.636c-cloud2-2giceoll88a02-3b3b3dcd374-1340085102/${templatePath}`
    }
    // ─────────────────────────────────────────────────────────────────────────
    
    console.log('Word模板文件路径:', cloudFileId, '(用户身份:', userType, ')')
    
    // 从云存储下载Word模板 - 增加重试机制处理偶发SSL错误
    console.log('尝试方法1: 使用cloud.downloadFile')
    let downloadResult
    let lastError
    
    // 重试机制：最多尝试3次（识别模式模板可额外降级到 internship/r_1）
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`下载尝试 ${attempt}/3`)
        downloadResult = await cloud.downloadFile({
          fileID: cloudFileId
        })
        console.log(`下载尝试 ${attempt} 成功`)
        break // 成功则跳出循环
      } catch (error) {
        console.error(`下载尝试 ${attempt} 失败:`, error.message)
        lastError = error
        
        // 识别模式模板：首次失败时尝试降级到 internship/r_1（模板未上线）
        if (isRecognitionTemplate(templateId) && !recognitionTemplateFallback) {
          const fallbackId = buildRecognitionTemplateCloudId('word_r_1', 'internship')
          if (cloudFileId !== fallbackId) {
            console.warn(`[模板降级] ${cloudFileId} 下载失败，自动回退到 ${fallbackId}`)
            cloudFileId = fallbackId
            recognitionTemplateFallback = true
            attempt = 0  // 重置重试计数，给降级模板完整的3次机会
            continue
          }
        }

        // SSL 错误且不是最后一次尝试，等待后重试
        if (error.message.includes('EPROTO') || error.message.includes('SSL') || error.message.includes('TLS')) {
          if (attempt < 3) {
            console.log(`检测到SSL错误，等待 ${attempt * 500}ms 后重试...`)
            await new Promise(resolve => setTimeout(resolve, attempt * 500))
            continue
          }
        }
        
        // 非SSL错误或最后一次尝试失败，直接抛出错误
        throw error
      }
    }
    
    // 如果所有重试都失败
    if (!downloadResult) {
      throw lastError || new Error('下载失败：所有重试都失败')
    }
    
    console.log('下载结果详细信息:', {
      statusCode: downloadResult.statusCode,
      tempFilePath: downloadResult.tempFilePath,
      errMsg: downloadResult.errMsg,
      fileContent: downloadResult.fileContent ? '有内容' : '无内容'
    })
    
    if (downloadResult.statusCode !== 200) {
      throw new Error(`Word模板下载失败，状态码: ${downloadResult.statusCode}, 错误信息: ${downloadResult.errMsg}`)
    }
    
    // 在云函数环境中，可能需要使用fileContent而不是tempFilePath
    if (downloadResult.fileContent) {
      console.log('使用fileContent方式获取文件')
      const fileSize = downloadResult.fileContent.length
      console.log('Word模板下载成功 (fileContent方式):')
      console.log('- 文件大小:', fileSize, 'bytes')
      
      return {
        success: true,
        templateId: templateId,
        fileContent: downloadResult.fileContent,
        fileSize: fileSize,
        message: 'Word模板下载成功'
      }
    }
    
    if (downloadResult.tempFilePath) {
      console.log('使用tempFilePath方式获取文件')
      // 验证文件是否存在并获取文件信息
      const fs = require('fs')
      if (!fs.existsSync(downloadResult.tempFilePath)) {
        throw new Error(`临时文件不存在: ${downloadResult.tempFilePath}`)
      }
      
      const stats = fs.statSync(downloadResult.tempFilePath)
      console.log('Word模板下载成功 (tempFilePath方式):')
      console.log('- 临时文件路径:', downloadResult.tempFilePath)
      console.log('- 文件大小:', stats.size, 'bytes')
      console.log('- 文件修改时间:', stats.mtime)
      
      return {
        success: true,
        templateId: templateId,
        tempFilePath: downloadResult.tempFilePath,
        fileSize: stats.size,
        message: 'Word模板下载成功'
      }
    }
    
    // 如果两种方式都不可用，尝试使用getTempFileURL
    console.log('尝试方法2: 使用getTempFileURL获取下载链接')
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [cloudFileId]
    })
    
    console.log('临时URL结果:', tempUrlResult)
    
    if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0 && tempUrlResult.fileList[0].tempFileURL) {
      const tempFileURL = tempUrlResult.fileList[0].tempFileURL
      console.log('获取到临时下载URL:', tempFileURL)
      
      // 使用HTTP请求下载文件 - 增加重试机制
      const axios = require('axios')
      let response
      let httpError
      
      // HTTP下载重试机制：最多尝试3次
      for (let httpAttempt = 1; httpAttempt <= 3; httpAttempt++) {
        try {
          console.log(`HTTP下载尝试 ${httpAttempt}/3`)
          response = await axios.get(tempFileURL, {
            responseType: 'arraybuffer',
            timeout: 30000,
            // 添加SSL相关配置
            httpsAgent: new (require('https').Agent)({
              rejectUnauthorized: true,
              keepAlive: false
            })
          })
          console.log(`HTTP下载尝试 ${httpAttempt} 成功`)
          break
        } catch (error) {
          console.error(`HTTP下载尝试 ${httpAttempt} 失败:`, error.message)
          httpError = error
          
          // 如果是网络错误且不是最后一次尝试，等待后重试
          if ((error.code === 'EPROTO' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && httpAttempt < 3) {
            console.log(`检测到网络错误，等待 ${httpAttempt * 1000}ms 后重试...`)
            await new Promise(resolve => setTimeout(resolve, httpAttempt * 1000))
            continue
          }
          
          // 非网络错误或最后一次尝试失败，抛出错误
          if (httpAttempt === 3) {
            throw error
          }
        }
      }
      
      if (response.status === 200 && response.data) {
        const fileBuffer = Buffer.from(response.data)
        console.log('通过HTTP下载成功:')
        console.log('- 文件大小:', fileBuffer.length, 'bytes')
        
        return {
          success: true,
          templateId: templateId,
          fileContent: fileBuffer,
          fileSize: fileBuffer.length,
          downloadUrl: tempFileURL,
          message: 'Word模板下载成功'
        }
      } else {
        throw new Error(`HTTP下载失败，状态码: ${response.status}`)
      }
    }
    
    // 如果以上方法都失败，尝试使用备用下载策略
    console.log('尝试方法3: 使用备用cloud.downloadFile策略')
    try {
      // 清理重复的云存储ID前缀，某些情况下可能存在格式问题
      const cleanFileId = cloudFileId.replace(/^cloud:\/\/[^\/]+\//, 'cloud://cloud2-2giceoll88a02-3b3b3dcd374.636c-cloud2-2giceoll88a02-3b3b3dcd374-1340085102/')
      
      const backupDownloadResult = await cloud.downloadFile({
        fileID: cleanFileId
      })
      
      if (backupDownloadResult.statusCode === 200) {
        console.log('备用下载策略成功')
        
        if (backupDownloadResult.fileContent) {
          return {
            success: true,
            templateId: templateId,
            fileContent: backupDownloadResult.fileContent,
            fileSize: backupDownloadResult.fileContent.length,
            message: 'Word模板下载成功 (备用策略)'
          }
        }
        
        if (backupDownloadResult.tempFilePath) {
          const fs = require('fs')
          if (fs.existsSync(backupDownloadResult.tempFilePath)) {
            const stats = fs.statSync(backupDownloadResult.tempFilePath)
            return {
              success: true,
              templateId: templateId,
              tempFilePath: backupDownloadResult.tempFilePath,
              fileSize: stats.size,
              message: 'Word模板下载成功 (备用策略)'
            }
          }
        }
      }
    } catch (backupError) {
      console.error('备用下载策略也失败:', backupError.message)
    }
    
    throw new Error('所有下载方法都失败了')
    
  } catch (error) {
    console.error('下载Word模板失败:', error)
    
    // 提供更详细的错误信息
    let errorMessage = 'Word模板下载失败'
    if (error.message.includes('EPROTO') || error.message.includes('SSL') || error.message.includes('TLS')) {
      errorMessage += '：网络连接异常，请稍后重试'
    } else if (error.message.includes('timeout')) {
      errorMessage += '：请求超时，请检查网络连接'
    } else {
      errorMessage += '，请检查模板文件是否已上传到云存储'
    }
    
    return {
      success: false,
      templateId: event.templateId,
      error: error.message,
      message: errorMessage,
      retryable: error.message.includes('EPROTO') || error.message.includes('SSL') || error.message.includes('timeout')
    }
  }
}

/**
 * 生成简历预览 - 使用Word模板文件
 */
async function generatePreview(event) {
  try {
    console.log('云函数版本：2025-06-23-v2')
    console.log('generatePreview 接收到的完整event:', JSON.stringify(event, null, 2))
    
    const { templateId, userData, userType } = event
    
    console.log('解构后的templateId:', templateId)
    console.log('解构后的userData:', userData ? 'userData存在' : 'userData不存在')
    console.log('开始生成Word简历预览:', templateId)
    
    if (!templateId) {
      throw new Error('templateId 参数缺失')
    }
    
    // 1. 下载Word模板文件
    const templateResult = await downloadTemplate({ templateId, userType })
    
    if (!templateResult.success) {
      return {
        success: false,
        templateId: templateId,
        error: templateResult.error,
        message: 'Word模板文件获取失败'
      }
    }
    
    // 2. 获取Word模板文件内容
    let templateBuffer
    
    console.log('准备获取Word模板文件内容:')
    console.log('- 文件大小:', templateResult.fileSize, 'bytes')
    
    if (templateResult.fileContent) {
      console.log('使用fileContent方式获取模板内容')
      templateBuffer = templateResult.fileContent
    } else if (templateResult.tempFilePath) {
      console.log('使用tempFilePath方式读取模板文件')
      console.log('- 文件路径:', templateResult.tempFilePath)
      
      const fs = require('fs')
      if (!fs.existsSync(templateResult.tempFilePath)) {
        throw new Error(`Word模板文件不存在: ${templateResult.tempFilePath}`)
      }
      
      templateBuffer = fs.readFileSync(templateResult.tempFilePath)
    } else {
      throw new Error('无法获取Word模板文件内容')
    }
    
    console.log('Word模板文件读取成功，大小:', templateBuffer.length, 'bytes')
    
    // 3. 这里应该填充用户数据到Word模板
    // 暂时先使用原始模板进行预览，后续可以添加数据填充功能
    let processedWordBuffer = templateBuffer
    
    if (userData && Object.keys(userData).length > 0) {
      console.log('检测到用户数据，开始填充Word模板')
      const result = await fillWordTemplate(templateBuffer, userData)
      processedWordBuffer = result.processedWordBuffer
      console.log('Word模板数据填充完成')
    }
    
    // 4. 上传处理后的Word文档到COS
    const wordKey = `documents/${templateId}_${Date.now()}.docx`
    console.log('上传Word文档到COS:', wordKey)
    
    const cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey
    })
    
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: wordKey,
        Body: processedWordBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }, (err, data) => {
        if (err) {
          console.error('Word文档上传失败:', err)
          reject(err)
        } else {
          console.log('Word文档上传成功:', data)
          resolve(data)
        }
      })
    })
    
    // 5. 调用数据万象文档预览服务转换为图片
    const convertResult = await convertWordToImages(wordKey, templateId)
    
    console.log('Word文档转图片API调用结果:', convertResult)
    
    if (convertResult && convertResult.success && convertResult.images && convertResult.images.length > 0) {
      console.log('Word文档转图片成功，返回图片预览')
      return {
        success: true,
        templateId: templateId,
        previewType: 'word_document',
        previewUrl: null,
        previewImages: convertResult.images,
        totalPages: convertResult.totalPages,
        fallback: false,
        wordFileKey: wordKey,
        message: convertResult.message,

      }
    } else {
      console.error('Word文档转图片失败')
      return {
        success: false,
        templateId: templateId,
        previewType: 'error',
        previewUrl: null,
        previewImages: [],
        fallback: true,
        error: convertResult ? convertResult.error : 'Word文档转图片失败，数据万象API调用失败',
        message: convertResult ? convertResult.message : 'Word文档转图片失败，请检查数据万象服务配置'
      }
    }
    
  } catch (error) {
    console.error('生成Word预览失败:', error)
    
    return {
      success: false,
      templateId: event.templateId,
      previewType: 'error',
      previewUrl: null,
      previewImages: [],
      fallback: true,
      error: error.message,
      message: 'Word预览生成失败: ' + error.message
    }
  }
}

/**
 * 使用前端准备的模板数据生成预览
 */
async function generatePreviewWithTemplateData(event) {
  try {
          console.log('generatePreviewWithTemplateData 开始')
    
    const { templateId, templateData, userType } = event
    
    if (!templateId || !templateData) {
      throw new Error('templateId 或 templateData 参数缺失')
    }
    
    console.log('模板ID:', templateId)
    console.log('用户身份:', userType)
    console.log('模板数据字段数量:', Object.keys(templateData).length)
    
    // 1. 下载Word模板文件
    const templateResult = await downloadTemplate({ templateId, userType })
    
    if (!templateResult.success) {
      return {
        success: false,
        templateId: templateId,
        error: templateResult.error,
        message: 'Word模板文件获取失败'
      }
    }
    
    // 2. 获取Word模板文件内容
    let templateBuffer
    
    if (templateResult.fileContent) {
      templateBuffer = templateResult.fileContent
    } else if (templateResult.tempFilePath) {
      const fs = require('fs')
      templateBuffer = fs.readFileSync(templateResult.tempFilePath)
    } else {
      throw new Error('无法获取Word模板文件内容')
    }
    
    console.log('Word模板文件读取成功')
    
    // 3. 使用新的图片处理功能填充Word模板
            console.log('使用支持图片的Word模板处理系统')
    console.log('是否有证件照需要处理:', templateData['基本_证件照'] ? '是' : '否')
    
    let processedWordBuffer
    try {
      // 直接使用支持图片处理的方案
      // 创建PizZip实例
      let zip = new PizZip(templateBuffer)
      
      // 先检查模板中是否包含证件照占位符
      const docPath = 'word/document.xml'
      let docContent = zip.file(docPath)?.asText()
      const hasPhotoPlaceholder = docContent ? docContent.includes('基本_证件照') : false
      console.log('模板中是否包含证件照占位符:', hasPhotoPlaceholder)
      
      // 检查是否有图片需要处理
      const hasPhoto = templateData['基本_证件照'] && templateData['基本_证件照'].trim() !== ''
      console.log('是否有证件照需要处理:', hasPhoto)
      
      // 如果模板没有证件照占位符，记录警告
      if (hasPhoto && !hasPhotoPlaceholder) {
        console.log('警告：有证件照数据但模板中没有占位符')
      }
      
      // 0. 预处理：给图片占位符分配特殊标识
      let photoPlaceholderInfo = null
      if (hasPhoto) {
        console.log('第0步：预处理图片占位符')
        photoPlaceholderInfo = await assignPhotoPlaceholderKeys(zip, templateId)
      }
      
      // 1. 进行标准文本填充
      console.log('第一步：进行标准文本填充')
      
      // 创建临时模板数据（用特殊标记替代证件照，便于后续替换）
      const textTemplateData = { ...templateData }
      if (hasPhoto) {
        // 用特殊标记替代证件照，这样docxtemplater会把占位符替换为这个标记
        textTemplateData['基本_证件照'] = '{{PHOTO_PLACEHOLDER_WILL_BE_REPLACED}}'
      }
      
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
          start: '{{',
          end: '}}'
        }
      })
      
      // 设置模板数据（不包含图片）
      doc.setData(textTemplateData)
      
      doc.render()
      console.log('文本模板渲染完成')
      
      // 获取渲染后的ZIP实例
      zip = doc.getZip()
      
      // 2. 如果有图片，进行图片处理
      if (hasPhoto) {
        console.log('第二步：进行图片插入处理')
        
        if (photoPlaceholderInfo && photoPlaceholderInfo.success) {
          // 如果在预处理阶段找到了图片占位符，使用图片替换方式
          console.log('使用预处理的图片占位符信息进行替换')
          zip = await replacePhotoWithPlaceholderInfo(zip, templateData, photoPlaceholderInfo)
        } else {
          // 降级：使用原来的方式（文本占位符或插入到开头）
          console.log('降级为文本占位符替换方式')
          zip = await processPhotoInWordTemplate(zip, templateData)
        }
      }
      
      // 3. 生成最终的Word文档
      processedWordBuffer = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      })
      
      console.log('Word文档处理完成')
      
      if (processedWordBuffer.length !== templateBuffer.length) {
        console.log('文档大小发生变化，数据填充成功')
      }
      
    } catch (fillError) {
      console.error('Word模板处理失败:', fillError.message)
      
      console.log('降级处理：使用原始模板')
      processedWordBuffer = templateBuffer
    }
    
    // 4. 上传处理后的Word文档到COS
    const wordKey = `documents/${templateId}_${Date.now()}.docx`
    console.log('上传Word文档到COS')
    
    const cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey
    })
    
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: wordKey,
        Body: processedWordBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }, (err, data) => {
        if (err) {
          console.error('Word文档上传失败:', err.message)
          reject(err)
        } else {
          console.log('Word文档上传成功')
          resolve(data)
        }
      })
    })
    
    // 5. 调用数据万象文档预览服务转换为图片
    const convertResult = await convertWordToImages(wordKey, templateId)
    
    console.log('Word文档转图片结果:', convertResult)
    
    if (convertResult && convertResult.success && convertResult.images && convertResult.images.length > 0) {
      console.log('Word文档转图片成功，返回图片预览')
      

      
      return {
        success: true,
        templateId: templateId,
        previewType: 'word_document',
        previewUrl: null,
        previewImages: convertResult.images,
        totalPages: convertResult.totalPages,
        fallback: false,
        wordFileKey: wordKey,
        message: convertResult.message,

      }
    } else {
      console.error('Word文档转图片失败')
      return {
        success: false,
        templateId: templateId,
        previewType: 'error',
        previewUrl: null,
        previewImages: [],
        fallback: true,
        error: convertResult ? convertResult.error : 'Word文档转图片失败',
        message: convertResult ? convertResult.message : 'Word文档转图片失败，请检查数据万象服务配置'
      }
    }
    
  } catch (error) {
    console.error('generatePreviewWithTemplateData 失败:', error)
    
    return {
      success: false,
      templateId: event.templateId,
      previewType: 'error',
      previewUrl: null,
      previewImages: [],
      fallback: true,
      error: error.message,
      message: 'Word预览生成失败: ' + error.message
    }
  }
}

/**
 * 使用准备好的模板数据填充Word模板
 */
async function fillWordTemplateWithData(templateBuffer, templateData) {
  try {
    console.log('开始使用准备好的数据填充Word模板')
    console.log('模板文件大小:', templateBuffer.length, 'bytes')
    console.log('模板数据:', JSON.stringify(templateData, null, 2))
    
    // 创建PizZip实例
    const zip = new PizZip(templateBuffer)
    
    // 创建docxtemplater实例
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      }
    })
    
    console.log('docxtemplater实例创建完成')
    
    // 设置模板数据
    doc.setData(templateData)
    console.log('模板数据设置完成')
    
    console.log('开始渲染模板...')
    try {
      // 渲染模板
      doc.render()
      console.log('模板渲染成功完成')
    } catch (error) {
      console.error('模板渲染失败:', error)
      console.error('错误类型:', error.name)
      console.error('错误消息:', error.message)
      
      // 如果渲染失败，记录详细错误信息
      if (error.properties && error.properties.errors instanceof Array) {
        console.error('渲染错误数量:', error.properties.errors.length)
        error.properties.errors.forEach((err, index) => {
          console.error(`渲染错误详情 ${index + 1}:`, err)
        })
      }
      throw error
    }
    
    // 生成新的Word文档
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })
    
    console.log('Word模板填充完成，新文档大小:', buf.length, 'bytes')
    return buf
    
  } catch (error) {
    console.error('fillWordTemplateWithData 失败:', error)
    console.error('错误详情:', error.message)
    
    // 如果填充失败，返回原始模板
    console.log('填充失败，返回原始模板')
    return templateBuffer
  }
}

/**
 * Word文档转图片 - 根据腾讯云数据万象官方文档重写
 */
async function convertWordToImages(wordKey, templateId) {
  try {
    console.log('开始Word文档转图片处理')
    console.log('文档Key:', wordKey)
    console.log('模板ID:', templateId)
    
    // 根据官方文档构建请求URL
    // GET /<ObjectKey>?ci-process=doc-preview&page=<page>&dstType=<dstType> HTTP/1.1
    // Host: <BucketName-APPID>.cos.<Region>.myqcloud.com
    
    const queryParams = {
      'ci-process': 'doc-preview',
      'dstType': 'png',
      'page': '1'
    }
    
    // 构建完整的请求URL
    const baseUrl = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${wordKey}`
    const queryString = Object.keys(queryParams).map(key => `${key}=${queryParams[key]}`).join('&')
    const fullUrl = `${baseUrl}?${queryString}`
    
    console.log('请求URL:', fullUrl)
    
    // 生成正确的请求签名
    const authorization = generateDocPreviewAuthorization(config, 'GET', `/${wordKey}`, queryParams)
    console.log('生成的签名:', authorization.substring(0, 50) + '...')
    
    // 发起HTTP请求
    console.log('发起数据万象API请求...')
    const response = await axios.get(fullUrl, {
      timeout: 30000,
      responseType: 'arraybuffer',
      headers: {
        'Authorization': authorization,
        'Host': `${config.bucket}.cos.${config.region}.myqcloud.com`
      }
    })
    
    console.log('API响应信息')
    console.log('状态码:', response.status)
    console.log('状态文本:', response.statusText)
    console.log('响应头:', JSON.stringify(response.headers, null, 2))
    
    // 检查响应头中的错误信息
    if (response.headers['x-errno']) {
      const errorCode = response.headers['x-errno']
      console.error('数据万象API返回错误码:', errorCode)
      
      // 根据官方文档的错误码说明
      const errorMessages = {
        '-3004': '文件不存在',
        '-3013': '指定页码不存在', 
        '-3015': '指定页码不存在'
      }
      
      const errorMessage = errorMessages[errorCode] || `未知错误码: ${errorCode}`
      throw new Error(`数据万象API错误: ${errorMessage} (错误码: ${errorCode})`)
    }
    
    // 成功响应检查
    if (response.status === 200) {
      console.log('API调用成功!')
      
      // 检查响应头中的文档信息
      if (response.headers['x-total-page']) {
        console.log('文档总页数:', response.headers['x-total-page'])
      }
      if (response.headers['content-type']) {
        console.log('响应内容类型:', response.headers['content-type'])
      }
      
      // 检查响应数据
      if (response.data && response.data.length > 0) {
        console.log('获得图片数据，大小:', response.data.length, 'bytes')

        const totalPagesNum = parseInt(response.headers['x-total-page'] || '1', 10)
        console.log('文档总页数（用于多页处理）:', totalPagesNum)

        const cos = new COS({
          SecretId: config.secretId,
          SecretKey: config.secretKey
        })

        // 上传第 1 页
        const imageKey = `preview_images/${templateId}_page1_${Date.now()}.png`
        console.log('开始上传预览图片到:', imageKey)

        await new Promise((resolve, reject) => {
          cos.putObject({
            Bucket: config.bucket,
            Region: config.region,
            Key: imageKey,
            Body: response.data,
            ContentType: 'image/png',
            ACL: 'public-read'
          }, (err, data) => {
            if (err) {
              console.error('预览图片上传失败:', err)
              reject(err)
            } else {
              console.log('预览图片上传成功:', data)
              resolve(data)
            }
          })
        })

        // 生成第 1 页带签名 URL
        const signedUrl = cos.getObjectUrl({
          Bucket: config.bucket,
          Region: config.region,
          Key: imageKey,
          Sign: true,
          Expires: 86400
        })

        const allSignedUrls = [signedUrl]

        // ── 多页循环：获取第 2 页及以后的页面（最多 10 页）──────────────
        const MAX_PAGES = 10
        const pagesToFetch = Math.min(totalPagesNum, MAX_PAGES)
        for (let page = 2; page <= pagesToFetch; page++) {
          try {
            const pageQueryParams = {
              'ci-process': 'doc-preview',
              'dstType': 'png',
              'page': String(page)
            }
            const pageQueryString = Object.keys(pageQueryParams)
              .map(k => `${k}=${pageQueryParams[k]}`).join('&')
            const pageFullUrl = `${baseUrl}?${pageQueryString}`
            const pageAuth = generateDocPreviewAuthorization(
              config, 'GET', `/${wordKey}`, pageQueryParams
            )

            console.log('请求第', page, '页...')
            const pageResp = await axios.get(pageFullUrl, {
              timeout: 30000,
              responseType: 'arraybuffer',
              headers: {
                'Authorization': pageAuth,
                'Host': `${config.bucket}.cos.${config.region}.myqcloud.com`
              }
            })

            if (pageResp.status === 200 && pageResp.data && pageResp.data.length > 0) {
              const pageKey = `preview_images/${templateId}_page${page}_${Date.now()}.png`
              await new Promise((resolve, reject) => {
                cos.putObject({
                  Bucket: config.bucket,
                  Region: config.region,
                  Key: pageKey,
                  Body: pageResp.data,
                  ContentType: 'image/png',
                  ACL: 'public-read'
                }, (err, data) => {
                  if (err) reject(err)
                  else resolve(data)
                })
              })
              const pageSignedUrl = cos.getObjectUrl({
                Bucket: config.bucket,
                Region: config.region,
                Key: pageKey,
                Sign: true,
                Expires: 86400
              })
              allSignedUrls.push(pageSignedUrl)
              console.log('第', page, '页处理完成')
            } else {
              console.warn('第', page, '页响应异常，跳过')
              break
            }
          } catch (pageErr) {
            console.warn('第', page, '页获取失败，停止多页处理:', pageErr.message)
            break
          }
        }

        console.log('处理完成，共', allSignedUrls.length, '页')
        console.log('预览图片带签名URL（24小时有效）:', allSignedUrls[0])

        return {
          success: true,
          images: allSignedUrls,
          totalPages: totalPagesNum,
          message: 'Word文档转图片成功'
        }
      } else {
        throw new Error('API响应成功但未返回图片数据')
      }
    } else {
      throw new Error(`API请求失败，状态码: ${response.status}, 状态文本: ${response.statusText}`)
    }
    
  } catch (error) {
    console.error('=== Word文档转图片失败 ===')
    console.error('错误类型:', error.constructor.name)
    console.error('错误消息:', error.message)
    
    if (error.response) {
      console.error('HTTP响应状态:', error.response.status)
      console.error('HTTP响应状态文本:', error.response.statusText)
      console.error('HTTP响应头:', JSON.stringify(error.response.headers, null, 2))
      
      // 尝试解析响应体中的错误信息
      if (error.response.data) {
        try {
          const errorText = error.response.data.toString()
          console.error('HTTP响应体:', errorText.substring(0, 500))
        } catch (e) {
          console.error('无法解析响应体')
        }
      }
    } else if (error.request) {
      console.error('请求发送失败:', error.request)
    }
    
    return {
      success: false,
      error: error.message,
      message: 'Word文档转图片失败'
    }
  }
}

/**
 * 填充Word模板数据 - 支持图片插入
 */
async function fillWordTemplate(templateBuffer, userData) {
  try {
    console.log('开始填充Word模板数据（支持图片插入）')
    console.log('模板文件大小:', templateBuffer.length, 'bytes')
    console.log('用户数据:', JSON.stringify(userData, null, 2))
    
    // 创建PizZip实例
    let zip = new PizZip(templateBuffer)
    
    // 准备模板数据
    const preparedData = await prepareTemplateData(userData)
    const templateData = preparedData.templateData

    console.log('准备的模板数据:', JSON.stringify(templateData, null, 2))

    
    // 检查是否有图片需要处理
    const hasPhoto = templateData['基本_证件照'] && templateData['基本_证件照'].trim() !== ''
    console.log('是否有证件照需要处理:', hasPhoto)
    
    // 1. 先使用docxtemplater进行标准文本填充
    console.log('第一步：进行标准文本填充')
    
    // 创建临时模板数据（用特殊标记替代证件照，便于后续替换）
    const textTemplateData = { ...templateData }
    if (hasPhoto) {
      // 用特殊标记替代证件照，这样docxtemplater会把占位符替换为这个标记
      textTemplateData['基本_证件照'] = '{{PHOTO_PLACEHOLDER_WILL_BE_REPLACED}}'
    }
    
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      }
    })
    
    console.log('docxtemplater实例创建完成')
    
    // 设置模板数据（不包含图片）
    doc.setData(textTemplateData)
    console.log('模板数据设置完成')
    
    console.log('开始渲染文本模板...')
    try {
      // 渲染模板
      doc.render()
      console.log('文本模板渲染成功完成')
    } catch (error) {
      console.error('文本模板渲染失败:', error)
      throw error
    }
    
    // 获取渲染后的ZIP实例
    zip = doc.getZip()
    
    // 2. 如果有图片，进行图片处理
    if (hasPhoto) {
      console.log('第二步：进行图片插入处理')
      zip = await processPhotoInWordTemplate(zip, templateData)
    }
    
    // 3. 生成最终的Word文档
    const buf = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })
    
    console.log('Word模板填充完成，新文档大小:', buf.length, 'bytes')
    
    if (hasPhoto) {
      console.log('文档包含图片，证件照已成功插入')
    }
    
    return {
      processedWordBuffer: buf,

    }
    
  } catch (error) {
    console.error('填充Word模板失败:', error)
    console.error('错误详情:', error.message)
    
    // 如果填充失败，返回原始模板
    console.log('填充失败，返回原始模板')
    return {
      processedWordBuffer: templateBuffer,

    }
  }
}

/**
 * 准备Word模板数据 - 新版本：支持新占位符系统和多条记录
 */
async function prepareTemplateData(userData, templateId = null) {
  const templateData = {}
  
  console.log('模板ID:', templateId)
  

  

  
  // ===== 基本信息模块 =====
  if (userData.basic) {
    console.log('处理基本信息模块')
    console.log('userData.basic:', JSON.stringify(userData.basic, null, 2))
    
    // 新占位符格式
    templateData['基本_姓名'] = userData.basic.name || ''
    templateData['基本_性别'] = formatGender(userData.basic.gender)
    
    // 处理证件照 - 支持云存储临时URL
    if (userData.basic.photo) {
      console.log('检测到证件照数据:', userData.basic.photo)
      
      // 如果是云存储fileID，转换为临时URL
      if (userData.basic.photo.startsWith('cloud://')) {
        try {
          console.log('转换云存储文件ID为临时URL:', userData.basic.photo)
          const result = await cloud.getTempFileURL({
            fileList: [userData.basic.photo]
          })
          
          if (result.fileList && result.fileList.length > 0 && result.fileList[0].tempFileURL) {
            templateData['基本_证件照'] = result.fileList[0].tempFileURL
            console.log('证件照临时URL获取成功:', result.fileList[0].tempFileURL)
          } else {
            console.error('获取证件照临时URL失败')
            templateData['基本_证件照'] = ''
          }
        } catch (error) {
          console.error('转换证件照URL失败:', error)
          templateData['基本_证件照'] = ''
        }
      } else {
        // 直接使用HTTP URL
        templateData['基本_证件照'] = userData.basic.photo
        console.log('使用直接HTTP URL:', userData.basic.photo)
      }
    } else {
      templateData['基本_证件照'] = ''
      console.log('未提供证件照')
    }
    // 🔧 修复：同时支持age字段（超级模式）和birth字段（信息模块页）
    if (userData.basic.age) {
      // 超级模式：直接使用age字段
      templateData['基本_年龄'] = userData.basic.age
      console.log('使用超级模式age字段:', userData.basic.age)
    } else if (userData.basic.birth) {
      // 信息模块页：通过birth字段计算age
    templateData['基本_年龄'] = calculateAge(userData.basic.birth) || ''
      console.log('通过birth字段计算年龄:', templateData['基本_年龄'])
    } else {
      templateData['基本_年龄'] = ''
      console.log('未提供年龄或出生日期')
    }
    templateData['基本_电话'] = userData.basic.phone || ''
    templateData['基本_邮箱'] = userData.basic.email || ''
    templateData['基本_体重'] = userData.basic.weight ? `${userData.basic.weight}kg` : ''
    templateData['基本_健康状况'] = userData.basic.health || ''
    templateData['基本_学校'] = userData.basic.school || ''
    
    console.log('基本信息填充结果:')
    console.log('- 基本_姓名:', templateData['基本_姓名'])
    console.log('- 基本_性别:', templateData['基本_性别'])  // 🔧 新增
    console.log('- 基本_年龄:', templateData['基本_年龄'])
    console.log('- 基本_电话:', templateData['基本_电话'])
    console.log('- 基本_邮箱:', templateData['基本_邮箱'])
    console.log('- 基本_微信:', templateData['基本_微信'])  // 🔧 新增
    console.log('- 基本_现居城市:', templateData['基本_现居城市'])  // 🔧 将在后面设置
    console.log('- 基本_籍贯:', templateData['基本_籍贯'])  // 🔧 将在后面设置
    console.log('- 基本_民族:', templateData['基本_民族'])  // 🔧 将在后面设置
    console.log('- 基本_政治面貌:', templateData['基本_政治面貌'])  // 🔧 将在后面设置
    console.log('- 基本_证件照:', templateData['基本_证件照'] ? '已设置' : '未设置')
    templateData['基本_地址'] = formatAddress(userData.basic)
    templateData['基本_微信'] = userData.basic.wechat || ''
    templateData['基本_出生日期'] = formatDate(userData.basic.birth)
    templateData['基本_婚姻状况'] = formatMaritalStatus(userData.basic.maritalStatus)
    templateData['基本_政治面貌'] = formatPoliticalStatus(userData.basic.politicalStatus)
    templateData['基本_民族'] = userData.basic.ethnicity || ''
    templateData['基本_身高'] = userData.basic.height ? `${userData.basic.height}cm` : ''
    templateData['基本_体重'] = userData.basic.weight ? `${userData.basic.weight}kg` : ''
    templateData['基本_健康状况'] = userData.basic.health || ''
    templateData['基本_学校'] = userData.basic.school || ''
    templateData['基本_学历'] = formatEducationLevel(userData.basic.education)
    // 🔧 修复：同时支持city（信息模块页）和location（超级模式）字段
    templateData['基本_现居城市'] = userData.basic.location || userData.basic.city || ''
    console.log('- 基本_现居城市:', templateData['基本_现居城市'], '(来源:', userData.basic.location ? 'location' : userData.basic.city ? 'city' : '未设置', ')')
    templateData['基本_籍贯'] = userData.basic.hometown || ''
    
    console.log('政治面貌相关调试:')
    console.log('- userData.basic.politicalStatus原值:', userData.basic.politicalStatus)
    console.log('- 基本_政治面貌格式化后:', templateData['基本_政治面貌'])
    console.log('- userData.basic.maritalStatus原值:', userData.basic.maritalStatus)
    console.log('- 基本_婚姻状况格式化后:', templateData['基本_婚姻状况'])
    
    // 兼容旧占位符
    templateData['姓名'] = userData.basic.name || ''
    templateData['电话'] = userData.basic.phone || ''
    templateData['邮箱'] = userData.basic.email || ''
  }
  
  // ===== 求职意愿模块 =====
  if (userData.career) {
    templateData['求职_期望职位'] = userData.career.position || ''
    templateData['求职_期望地区'] = userData.career.city || ''
    templateData['求职_期望薪资'] = formatSalary(userData.career.salary)
    templateData['求职_求职状态'] = formatJobStatus(userData.career.status)
    
    // 兼容旧占位符
    templateData['期望职位'] = userData.career.position || ''
  }
  
  // ===== 教育经历模块（多条记录）=====
  if (userData.education) {
    const educationItems = processMultipleRecords(userData.education, 'education', [
      'school', 'college', 'major', 'degree', 'startDate', 'endDate', 'gpa', 'courses', 'mainCourses', 'description'  // 🔧 新增mainCourses字段
    ])
    

    
    // 直接处理所有教育记录，基于必填字段判断是否有效
    console.log(`📊 教育经历模块: 处理所有用户记录，基于必填字段计数`)
    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < educationItems.length; i++) {
      const item = educationItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 教育经历第${index}条: 学校="${item.school || ''}" 专业="${item.major || ''}" 主修课程="${item.mainCourses || item.courses || ''}"`)
      
      templateData[`教育_学校名称_${index}`] = item.school || ''
      templateData[`教育_学院名称_${index}`] = item.college || ''
      templateData[`教育_专业名称_${index}`] = item.major || ''
      templateData[`教育_学历层次_${index}`] = item.degree || ''
      templateData[`教育_开始时间_${index}`] = formatDate(item.startDate)
      templateData[`教育_结束时间_${index}`] = formatDate(item.endDate)
      templateData[`教育_学业成绩_${index}`] = item.gpa || ''
      // 🔧 修复：同时支持mainCourses（超级模式）和courses（信息模块页）字段
      templateData[`教育_主要课程_${index}`] = item.mainCourses || item.courses || ''
      templateData[`教育_教育描述_${index}`] = item.description || ''
    }
    

    
    // 兼容旧占位符（映射到第一条记录）
    const firstEducation = educationItems[0] || {}
    templateData['学校名称'] = firstEducation.school || ''
    templateData['专业名称'] = firstEducation.major || ''
  }
  
  // ===== 工作经历模块（多条记录）=====
  if (userData.work) {
    const workItems = processMultipleRecords(userData.work, 'work', [
      'company', 'department', 'position', 'startDate', 'endDate', 'description', 'content', 'achievements'
    ])
    

    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 工作经历第${index}条: 公司="${item.company || ''}" 职位="${item.position || ''}"`)
      
      templateData[`工作_公司名称_${index}`] = item.company || ''
      templateData[`工作_部门名称_${index}`] = item.department || ''
      templateData[`工作_职位名称_${index}`] = item.position || ''
      templateData[`工作_开始时间_${index}`] = formatDate(item.startDate)
      templateData[`工作_结束时间_${index}`] = formatDate(item.endDate)
      templateData[`工作_工作描述_${index}`] = item.description || ''
      templateData[`工作_工作内容_${index}`] = item.content || ''
      templateData[`工作_工作成就_${index}`] = item.achievements || ''
    }
    

    
    // 兼容旧占位符（映射到第一条记录）
    const firstWork = workItems[0] || {}
    templateData['公司名称'] = firstWork.company || ''
    templateData['职位名称'] = firstWork.position || ''
  }
  
  // ===== 实习经历模块（多条记录）=====
  if (userData.internship) {
    const internshipItems = processMultipleRecords(userData.internship, 'internship', [
      'company', 'position', 'startDate', 'endDate', 'description', 'content', 'achievements'
    ])
    
    console.log('实习经历处理 - 原始数据:', JSON.stringify(userData.internship, null, 2))
    console.log('实习经历处理 - 处理后的items:', JSON.stringify(internshipItems, null, 2))
    

    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < internshipItems.length; i++) {
      const item = internshipItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 实习经历第${index}条: 公司="${item.company || ''}" 职位="${item.position || ''}"`)
      
      console.log(`实习经历${index} - endDate原始值:`, item.endDate)
      const formattedEndDate = formatDate(item.endDate)
      console.log(`实习经历${index} - formatDate处理后:`, formattedEndDate)
      
      templateData[`实习_公司名称_${index}`] = item.company || ''
      templateData[`实习_职位名称_${index}`] = item.position || ''
      templateData[`实习_开始时间_${index}`] = formatDate(item.startDate)
      templateData[`实习_结束时间_${index}`] = formattedEndDate
      
      // 调试：确认模板数据设置
      console.log(`实习经历${index} - 模板数据设置: 实习_结束时间_${index} = "${templateData[`实习_结束时间_${index}`]}")`)
      templateData[`实习_实习描述_${index}`] = item.description || ''
      templateData[`实习_实习内容_${index}`] = item.content || ''
      templateData[`实习_实习成就_${index}`] = item.achievements || ''
    }
    

  }
  
  // ===== 项目经历模块（多条记录）=====
  if (userData.project) {
    console.log('=== 处理项目经历模块 ===')
    console.log('userData.project:', JSON.stringify(userData.project, null, 2))
    
    const projectItems = processMultipleRecords(userData.project, 'project', [
      'projectName', 'role', 'startDate', 'endDate', 'description', 'content'
    ])
    
    console.log('processMultipleRecords返回的项目列表:', JSON.stringify(projectItems, null, 2))
    

    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < projectItems.length; i++) {
      const item = projectItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 项目经历第${index}条: 项目="${item.projectName || ''}" 角色="${item.role || ''}"`)
      
      // 调试项目经历的"至今"处理
      if (item.endDate) {
        console.log(`项目经历${index} - endDate原始值:`, item.endDate)
        const formattedEndDate = formatDate(item.endDate)
        console.log(`项目经历${index} - formatDate处理后:`, formattedEndDate)
        templateData[`项目_结束时间_${index}`] = formattedEndDate
        console.log(`项目经历${index} - 模板数据设置: 项目_结束时间_${index} = "${templateData[`项目_结束时间_${index}`]}")`)
      } else {
        templateData[`项目_结束时间_${index}`] = ''
      }
      
      templateData[`项目_项目名称_${index}`] = item.projectName || ''
      templateData[`项目_担任角色_${index}`] = item.role || ''
      templateData[`项目_开始时间_${index}`] = formatDate(item.startDate)
      templateData[`项目_项目描述_${index}`] = item.description || ''
      templateData[`项目_项目内容_${index}`] = item.content || ''
    }
    

    
    // 兼容旧的列表格式
    templateData['项目经历列表'] = formatProjectList(userData.project)
  }
  
  // ===== 职业技能模块（多条记录）=====
  if (userData.skill) {
    const skillItems = processMultipleRecords(userData.skill, 'skill', ['skillName', 'level', 'description'])
    

    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < skillItems.length; i++) {
      const item = skillItems[i] || {}
      const index = i + 1
      
      // 使用必填字段判断记录是否有效
      // 记录处理日志
      console.log(` 职业技能第${index}条: 技能="${item.skillName}"`)
      
      templateData[`技能_技能名称_${index}`] = item.skillName || ''
      templateData[`技能_熟练程度_${index}`] = formatSkillLevel(item.level)
      templateData[`技能_技能描述_${index}`] = item.description || ''
    }
    

    
    // 兼容旧的列表格式
    templateData['职业技能列表'] = formatSkillList(userData.skill)
  }
  
  // ===== 奖项证书模块（多条记录）=====
  if (userData.certificate) {
    const certificateItems = processMultipleRecords(userData.certificate, 'certificate', [
      'name', 'date', 'issuer', 'description'
    ])
    

    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < certificateItems.length; i++) {
      const item = certificateItems[i] || {}
      const index = i + 1
      
      // 使用必填字段判断记录是否有效
      // 记录处理日志
      console.log(` 奖项证书第${index}条: 证书="${item.name}"`)
      
      templateData[`证书_证书名称_${index}`] = item.name || ''
      templateData[`证书_获得时间_${index}`] = formatDate(item.date)
      templateData[`证书_颁发机构_${index}`] = item.issuer || ''
      templateData[`证书_证书描述_${index}`] = item.description || ''
    }
    
    // 兼容旧的列表格式
    templateData['奖项证书列表'] = formatCertificateList(userData.certificate)
  }
  
  // ===== 技能证书模块（多条记录）=====
  if (userData.skillCertificate) {
    let skillCertificateItems = []
    
    // 支持多种数据结构
    if (userData.skillCertificate.skillCertificates && Array.isArray(userData.skillCertificate.skillCertificates)) {
      // 标准结构：{ skillCertificates: [...] }
      skillCertificateItems = userData.skillCertificate.skillCertificates
    } else if (userData.skillCertificate.items && Array.isArray(userData.skillCertificate.items)) {
      // 兼容结构：{ items: [...] }
      skillCertificateItems = userData.skillCertificate.items
    } else if (Array.isArray(userData.skillCertificate)) {
      // 直接数组结构
      skillCertificateItems = userData.skillCertificate
    }
    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < skillCertificateItems.length; i++) {
      const item = skillCertificateItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 技能证书第${index}条: 证书="${item.name}"`)
      
      templateData[`技能证书_证书名称_${index}`] = item.name || ''
      templateData[`技能证书_获得时间_${index}`] = formatDate(item.date)
      templateData[`技能证书_颁发机构_${index}`] = item.issuer || ''
      templateData[`技能证书_证书描述_${index}`] = item.description || ''
    }
    


    
    // 兼容旧的列表格式
    templateData['技能证书列表'] = formatSkillCertificateList(skillCertificateItems)
    
    console.log(`技能证书模块处理完成，共${skillCertificateItems.length}条记录`)
  } else if (userData.skill_certificate) {
    // 直接处理skill_certificate数据，创建skillCertificate格式以适配键名库
    console.log('发现skill_certificate格式数据，直接转换为skillCertificate格式')
    
    // 直接创建skillCertificate格式的数据以适配键名库
    userData.skillCertificate = userData.skill_certificate
    console.log('✅ 已创建skillCertificate格式数据，适配键名库')
    
    const skillCertificateItems = processMultipleRecords(userData.skill_certificate, 'skill_certificate', [
      'name', 'date', 'issuer', 'description'
    ])
    


    
    // 填充新占位符（处理所有用户数据，与skillCertificate分支保持一致）
    for (let i = 0; i < skillCertificateItems.length; i++) {
      const item = skillCertificateItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 技能证书第${index}条: 证书="${item.name}"`)
      
      templateData[`技能证书_证书名称_${index}`] = item.name || ''
      templateData[`技能证书_获得时间_${index}`] = formatDate(item.date)
      templateData[`技能证书_颁发机构_${index}`] = item.issuer || ''
      templateData[`技能证书_证书描述_${index}`] = item.description || ''
    }
    


    
    // 兼容旧的列表格式
    templateData['技能证书列表'] = formatSkillCertificateList(skillCertificateItems)
    
    console.log(`技能证书模块处理完成（skill_certificate格式），共${skillCertificateItems.length}条记录`)
  }
  
  // ===== 自我评价模块 =====
  if (userData.selfEvaluation) {
    templateData['评价_自我评价'] = userData.selfEvaluation.content || ''
    // 兼容旧占位符
    templateData['自我评价'] = userData.selfEvaluation.content || ''
  } else if (userData.self_evaluation) {
    // 兼容旧的字段名
    templateData['评价_自我评价'] = userData.self_evaluation.content || ''
    templateData['自我评价'] = userData.self_evaluation.content || ''
  }
  
  // ===== 兴趣爱好模块（多条记录）=====
  if (userData.hobby) {
    const hobbyItems = processMultipleRecords(userData.hobby, 'hobby', ['name'])
    


    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < hobbyItems.length; i++) {
      const item = hobbyItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 兴趣爱好第${index}条: 爱好="${item.name}"`)
      
      templateData[`爱好_爱好名称_${index}`] = item.name || ''
    }
    


    
    // 兼容旧的列表格式
    templateData['兴趣爱好列表'] = formatHobbyList(userData.hobby)
  }
  
  // ===== 报考信息模块 =====
  if (userData.examInfo || userData.exam_info) {
    const examData = userData.examInfo || userData.exam_info
    templateData['报考_报考学校'] = examData.school || ''
    templateData['报考_报考专业'] = examData.major || ''
    templateData['报考_考试总分'] = examData.totalScore || ''
    
    // 报考科目（最多15条）
    const subjects = examData.subjects || []
    for (let i = 0; i < 15; i++) {
      const subject = subjects[i] || {}
      const index = i + 1
      
      templateData[`报考_科目名称_${index}`] = subject.name || ''
      templateData[`报考_科目成绩_${index}`] = subject.score || ''
    }
    
    // 兼容旧的列表格式
    templateData['单科成绩列表'] = formatExamScoreList(examData)
  }
  
  // ===== 在校经历模块（多条记录）=====
  // 优先使用下划线格式（实际存储格式）
  if (userData.school_experience) {
    const schoolItems = processMultipleRecords(userData.school_experience, 'school_experience', [
      'experienceName', 'role', 'startDate', 'endDate', 'description'
    ])
    


    
    // 填充新占位符（处理所有用户数据）
    for (let i = 0; i < schoolItems.length; i++) {
      const item = schoolItems[i] || {}
      const index = i + 1
      
      // 记录处理日志
      console.log(` 在校经历第${index}条: 经历="${item.experienceName}"`)
      
      templateData[`校园_经历名称_${index}`] = item.experienceName || ''
      templateData[`校园_担任角色_${index}`] = item.role || ''
      templateData[`校园_开始时间_${index}`] = formatDate(item.startDate)
      templateData[`校园_结束时间_${index}`] = formatDate(item.endDate)
      templateData[`校园_经历描述_${index}`] = item.description || ''
    }
    


    
  } else if (userData.schoolExperience) {
    const schoolItems = processMultipleRecords(userData.schoolExperience, 'schoolExperience', [
      'experienceName', 'role', 'startDate', 'endDate', 'description'
    ])
    
    

    
    // 填充新占位符（最多4条）
    for (let i = 0; i < 4; i++) {
      const item = schoolItems[i] || {}
      const index = i + 1
      
      // 判断这条记录是否有实际内容
      const hasExperienceName = item.experienceName && String(item.experienceName).trim()
      
      if (hasExperienceName) {

        console.log(` 在校经历第${index}条: 经历="${item.experienceName}"`)
      } else {
        console.log(` 在校经历第${index}条: 空记录`)
      }
      
      templateData[`校园_经历名称_${index}`] = item.experienceName || ''
      templateData[`校园_担任角色_${index}`] = item.role || ''
      templateData[`校园_开始时间_${index}`] = formatDate(item.startDate)
      templateData[`校园_结束时间_${index}`] = formatDate(item.endDate)
      templateData[`校园_经历描述_${index}`] = item.description || ''
    }
    


  }
  
  // ===== 全局空值过滤：只保留有实际内容的字段，避免空占位符影响简历美观 =====
  const filteredData = {}
  for (const [key, value] of Object.entries(templateData)) {
    // 只保留有实际内容的字段
    if (value && value.toString().trim() !== '') {
      filteredData[key] = value
      // 调试：记录"至今"相关字段
      if (key.includes('结束时间') && value === '至今') {
        console.log(`数据过滤 - 保留"至今"字段: ${key} = ${value}`)
      }
    } else {
      // 调试：记录被过滤的"结束时间"字段
      if (key.includes('结束时间')) {
        console.log(`数据过滤 - 过滤掉的结束时间字段: ${key} = "${value}" (类型: ${typeof value})`)
      }
    }
  }
  
  console.log('数据过滤统计 - 原始字段:', Object.keys(templateData).length, '过滤后字段:', Object.keys(filteredData).length)
  
  return {
    templateData: filteredData
  }
}

/**
 * 处理多条记录数据（云函数版本）
 */
function processMultipleRecords(moduleData, moduleType, fields) {
  let items = []
  
  // 兼容处理：检查是否为新格式（items数组）或旧格式（单条记录）
  if (moduleData.items && Array.isArray(moduleData.items)) {
    // 新格式：多条记录
    items = moduleData.items
  } else if (moduleData.projects && Array.isArray(moduleData.projects)) {
    // 项目经历特殊处理
    items = moduleData.projects.map(project => ({
      projectName: project.projectName || project.name,
      role: project.role,
      startDate: project.startDate,
      endDate: project.endDate,
      description: project.description,
      content: project.content
    }))
  } else if (moduleData.skills && Array.isArray(moduleData.skills)) {
    // 技能特殊处理
    items = moduleData.skills.map(skill => ({
      skillName: skill.skillName || skill.name,
      level: skill.level,
      description: skill.description || ''
    }))
  } else if (moduleData.certificates && Array.isArray(moduleData.certificates)) {
    // 证书特殊处理
    items = moduleData.certificates
  } else if (moduleData.skillCertificates && Array.isArray(moduleData.skillCertificates)) {
    // 技能证书特殊处理
    items = moduleData.skillCertificates
  } else if (moduleData.hobbies && Array.isArray(moduleData.hobbies)) {
    // 爱好特殊处理
    items = moduleData.hobbies
  } else {
    // 旧格式：单条记录，转换为数组
    const singleItem = {}
    fields.forEach(field => {
      singleItem[field] = moduleData[field] || ''
    })
    
    // 只有在有实际内容时才添加
    const hasContent = fields.some(field => moduleData[field] && String(moduleData[field]).trim())
    if (hasContent) {
      items = [singleItem]
    }
  }
  
  return items
}

// 辅助格式化函数
function formatGender(gender) {
  // 🔧 修复：同时支持数字格式（信息模块页）和文本格式（超级模式）
  if (typeof gender === 'string') {
    // 超级模式：直接返回文本
    return gender
  }
  // 信息模块页：数字格式转换
  const genderMap = { 0: '男', 1: '女' }
  return genderMap[gender] || ''
}

function calculateAge(birthDate) {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  const today = new Date()
  const age = today.getFullYear() - birth.getFullYear()
  return age > 0 ? age.toString() : ''
}

function formatAddress(basic) {
  const parts = []
  if (basic.city) parts.push(basic.city)
  if (basic.address) parts.push(basic.address)
  return parts.join(' ')
}

function formatPoliticalStatus(status) {
  // 🔧 修复：同时支持数字格式（信息模块页）和文本格式（超级模式）
  if (typeof status === 'string') {
    // 超级模式：直接返回文本
    return status
  }
  // 信息模块页：数字格式转换
  const statusMap = {
    0: '群众',
    1: '团员',
    2: '党员',
    3: '民主党派',
    4: '其他'
  }
  return statusMap[status] || ''
}

function formatMaritalStatus(status) {
  const statusMap = { 0: '未婚', 1: '已婚', 2: '离异', 3: '丧偶' }
  return statusMap[status] || ''
}

function formatEducationLevel(level) {
  const levelMap = {
    0: '初中及以下',
    1: '高中/中专',
    2: '大专',
    3: '本科',
    4: '硕士',
    5: '博士',
    6: '其他'
  }
  return levelMap[level] || ''
}

function formatSalary(salary) {
  const salaryMap = {
    1: '3K以下', 2: '3K-5K', 3: '5K-8K', 4: '8K-12K',
    5: '12K-20K', 6: '20K-30K', 7: '30K以上'
  }
  return salaryMap[salary] || ''
}

function formatJobStatus(status) {
  const statusMap = { 1: '在职-考虑机会', 2: '在职-急寻新工作', 3: '离职-随时可工作' }
  return statusMap[status] || ''
}

function formatDate(dateString) {
  if (!dateString) return ''
  if (dateString === '至今') return '至今'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString // 如果日期无效，返回原字符串
  return date.toLocaleDateString('zh-CN')
}

function formatProjectList(project) {
  if (!project || !project.projects) return ''
  return project.projects.map(p => 
    `项目名称：${p.name || ''}\n项目描述：${p.description || ''}\n技术栈：${p.tech || ''}`
  ).join('\n\n')
}

function formatSkillList(skill) {
  if (!skill || !skill.skills) return ''
  return skill.skills.map(s => s.name || '').join('、')
}

function formatCertificateList(certificate) {
  if (!certificate || !certificate.certificates) return ''
  return certificate.certificates.map(c => 
    `${c.name || ''}${c.time ? ` (${formatDate(c.time)})` : ''}`
  ).join('\n')
}

function formatSkillCertificateList(skillCertificateData) {
  // 如果传入的是数组，直接处理
  if (Array.isArray(skillCertificateData)) {
    return skillCertificateData.map(c => 
      `${c.name || ''}${c.date ? ` (${formatDate(c.date)})` : ''}`
    ).join('\n')
  }
  
  // 处理实际的数据结构
  if (skillCertificateData && skillCertificateData.skillCertificates) {
    return skillCertificateData.skillCertificates.map(c => 
      `${c.name || ''}${c.date ? ` (${formatDate(c.date)})` : ''}`
    ).join('\n')
  }
  // 处理items格式
  if (skillCertificateData && skillCertificateData.items) {
    return skillCertificateData.items.map(c => 
      `${c.name || ''}${c.date ? ` (${formatDate(c.date)})` : ''}`
    ).join('\n')
  }
  return ''
}

function formatHobbyList(hobby) {
  if (!hobby || !hobby.hobbies) return ''
  return hobby.hobbies.map(h => h.name || '').join('、')
}

function formatSkillLevel(level) {
  const levelMap = {
    1: '初级',
    2: '中级', 
    3: '高级',
    4: '专家'
  }
  return levelMap[level] || ''
}

function formatExamScoreList(examInfo) {
  if (!examInfo || !examInfo.subjects) return ''
  return examInfo.subjects.map(s => 
    `${s.name || ''}：${s.score || ''}分`
  ).join('\n')
}

/**
 * 为数据万象文档预览生成正确的请求签名
 */
function generateDocPreviewAuthorization(config, method, objectKey, queryParams) {
  try {
    const now = Math.floor(Date.now() / 1000)
    const expired = now + 3600 // 1小时后过期
    
    // 时间戳
    const signTime = `${now};${expired}`
    const keyTime = signTime
    
    // 构建查询参数字符串（需要按字母顺序排序）
    const sortedQueryKeys = Object.keys(queryParams || {}).sort()
    const queryString = sortedQueryKeys.map(key => `${key.toLowerCase()}=${queryParams[key]}`).join('&')
    
    // 构建HttpString（根据腾讯云签名算法）
    const httpString = [
      method.toLowerCase(),
      objectKey,
      queryString,
      '', // headers (空字符串，因为我们不签入特定header)
      ''  // 空行
    ].join('\n')
    
    console.log('HttpString:', httpString)
    
    // 计算签名密钥
    const signKey = crypto.createHmac('sha1', config.secretKey).update(keyTime).digest('hex')
    
    // 计算StringToSign
    const sha1HttpString = crypto.createHash('sha1').update(httpString).digest('hex')
    const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`
    
    console.log('StringToSign:', stringToSign)
    
    // 计算最终签名
    const signature = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex')
    
    // 构建Authorization头
    const authorization = [
      'q-sign-algorithm=sha1',
      `q-ak=${config.secretId}`,
      `q-sign-time=${signTime}`,
      `q-key-time=${keyTime}`,
      'q-header-list=',
      `q-url-param-list=${sortedQueryKeys.map(key => key.toLowerCase()).join(';')}`,
      `q-signature=${signature}`
    ].join('&')
    
    return authorization
    
  } catch (error) {
    console.error('生成数据万象签名失败:', error)
    throw error
  }
}

/**
 * 生成完整简历 - 使用Word模板
 */
async function generateResume(event) {
  try {
    const { templateId, userData, userType } = event
    
    console.log('生成完整Word简历:', templateId)
    
    if (!templateId) {
      throw new Error('templateId 参数缺失')
    }
    
    // 检查用户数据
    if (!userData || Object.keys(userData).length === 0) {
      throw new Error('用户数据为空，请先填写简历信息')
    }
    
    // 1. 下载Word模板文件
    const templateResult = await downloadTemplate({ templateId, userType })
    
    if (!templateResult.success) {
      throw new Error('Word模板文件获取失败: ' + templateResult.error)
    }
    
    // 2. 读取并处理Word模板
    console.log('准备获取Word模板文件内容:')
    console.log('- templateResult.fileContent存在:', !!templateResult.fileContent)
    console.log('- templateResult.tempFilePath存在:', !!templateResult.tempFilePath)
    
    let templateBuffer
    if (templateResult.fileContent) {
      console.log('使用fileContent方式获取模板内容')
      templateBuffer = templateResult.fileContent
    } else if (templateResult.tempFilePath) {
      console.log('使用tempFilePath方式读取模板文件')
      console.log('- 文件路径:', templateResult.tempFilePath)
      
      const fs = require('fs')
      if (!fs.existsSync(templateResult.tempFilePath)) {
        throw new Error(`Word模板文件不存在: ${templateResult.tempFilePath}`)
      }
      
      templateBuffer = fs.readFileSync(templateResult.tempFilePath)
    } else {
      throw new Error('无法获取Word模板文件内容')
    }
    
    console.log('Word模板文件读取成功，大小:', templateBuffer.length, 'bytes')
    
    // 初始化COS客户端
    const cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Region: config.region
    })
    
    console.log('开始填充Word模板数据')
    
    // 使用支持图片的Word模板处理系统
    let processedWordBuffer = templateBuffer

    
    if (userData && Object.keys(userData).length > 0) {
      console.log('检测到用户数据，开始使用支持图片的处理系统')
      // 先生成模板数据
      const preparedData = await prepareTemplateData(userData)
      const templateData = preparedData.templateData

      processedWordBuffer = await fillWordTemplateWithData(templateBuffer, templateData)
      console.log('Word模板数据填充完成')
    }
    
    // 3. 上传处理后的Word文档到COS
    const fileName = `${templateId}_${Date.now()}.docx`
    const wordFileKey = `documents/${fileName}`
    
    console.log('上传Word文档到COS:', wordFileKey)
    
    const uploadResult = await cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: wordFileKey,
      Body: processedWordBuffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    
    console.log('Word文档上传成功:', uploadResult)
    
    // 4. 生成Word文档预览图片
    console.log('开始Word文档转图片处理')
    const previewResult = await convertWordToImages(wordFileKey, templateId)
    
    if (previewResult.success) {
      console.log('Word文档转图片成功')
      return {
        success: true,
        templateId: templateId,
        wordFileKey: wordFileKey,
        fileName: fileName,
        downloadUrl: wordFileKey,
        previewImages: previewResult.previewImages,
        totalPages: previewResult.totalPages,
        message: 'Word简历生成成功',

      }
    } else {
      // 即使预览生成失败，Word文档仍然可用
      console.log('Word文档转图片失败，但Word文档生成成功')
      return {
        success: true,
        templateId: templateId,
        wordFileKey: wordFileKey,
        fileName: fileName,
        downloadUrl: wordFileKey,
        previewImages: [],
        totalPages: 1,
        fallback: true,
        message: 'Word简历生成成功，预览图片生成失败',

      }
    }
    
  } catch (error) {
    console.error('生成Word简历失败:', error)
    return {
      success: false,
      templateId: event.templateId,
      error: error.message,
      message: 'Word简历生成失败: ' + error.message
    }
  }
} 

/**
 * 获取COS文件的临时下载链接
 */
async function getTempDownloadUrl(event) {
  try {
    const { fileKey } = event
    
    console.log('获取临时下载链接:', fileKey)
    
    if (!fileKey) {
      throw new Error('fileKey 参数缺失')
    }
    
    // 初始化COS客户端
    const cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Region: config.region
    })
    
    // 生成临时下载链接（有效期24小时，与预览图片保持一致）
    const downloadUrl = cos.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: fileKey,
      Sign: true,
      Expires: 86400 // 24小时，与预览图片保持一致
    })
    
    console.log('生成的临时下载链接:', downloadUrl)
    
    return {
      success: true,
      fileKey: fileKey,
      downloadUrl: downloadUrl,
      expiresIn: 86400,
      message: '临时下载链接生成成功'
    }
    
  } catch (error) {
    console.error('获取临时下载链接失败:', error)
    return {
      success: false,
      fileKey: event.fileKey,
      error: error.message,
      message: '获取临时下载链接失败: ' + error.message
    }
  }
}

/**
 * 从Word文档提取纯文本内容
 */
async function extractWordText(event) {
  try {
    const { fileKey } = event
    
    console.log('提取Word文档文本内容:', fileKey)
    
    if (!fileKey) {
      throw new Error('fileKey 参数缺失')
    }
    
    // 初始化COS客户端
    const cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Region: config.region
    })
    
    // 下载Word文档
    console.log('下载Word文档...')
    const downloadResult = await new Promise((resolve, reject) => {
      cos.getObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: fileKey
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
    
    if (!downloadResult.Body) {
      throw new Error('Word文档下载失败，未获取到文件内容')
    }
    
    console.log('Word文档下载成功，开始提取文本...')
    
    // 使用PizZip和docxtemplater提取文本
    const zip = new PizZip(downloadResult.Body)
    
    // 读取document.xml文件
    const docPath = 'word/document.xml'
    let docContent = zip.file(docPath)?.asText()
    
    if (!docContent) {
      throw new Error('无法读取Word文档内容')
    }
    
    // 简单的XML解析提取文本内容
    // 移除所有XML标签，只保留文本内容
    let textContent = docContent
      .replace(/<[^>]*>/g, ' ')  // 移除所有XML标签
      .replace(/\s+/g, ' ')      // 合并多个空白字符为单个空格
      .trim()                    // 移除首尾空白
    
    // 清理一些特殊字符和格式
    textContent = textContent
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    
    console.log('文本提取完成，内容长度:', textContent.length, '字符')
    console.log('提取的文本片段:', textContent.substring(0, 200) + '...')
    
    return {
      success: true,
      fileKey: fileKey,
      textContent: textContent,
      contentLength: textContent.length,
      message: 'Word文档文本提取成功'
    }
    
  } catch (error) {
    console.error('提取Word文档文本失败:', error)
    return {
      success: false,
      fileKey: event.fileKey,
      error: error.message,
      message: '提取Word文档文本失败: ' + error.message
    }
  }
}

/**
 * 清理COS存储中的过期文件
 */
async function cleanupCOSFiles(event) {
  try {
    const { dryRun = false } = event  // dryRun参数用于测试，不实际删除文件
    
    console.log('开始COS文件清理任务，dryRun模式:', dryRun)
    
    // 初始化COS客户端
    const cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Region: config.region
    })
    
    const cleanupResults = {
      documents: { deleted: 0, errors: 0, files: [] },
      previewImages: { deleted: 0, errors: 0, files: [] }
    }
    
    // 30天前的时间戳
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    console.log('清理30天前的文件，截止时间:', thirtyDaysAgo.toISOString())
    
    // 清理documents/目录下的Word文档
    console.log('=== 开始清理documents/目录 ===')
    await cleanupDirectory(cos, 'documents/', thirtyDaysAgo, cleanupResults.documents, dryRun)
    
    // 清理preview_images/目录下的预览图片
    console.log('=== 开始清理preview_images/目录 ===')
    await cleanupDirectory(cos, 'preview_images/', thirtyDaysAgo, cleanupResults.previewImages, dryRun)
    
    const totalDeleted = cleanupResults.documents.deleted + cleanupResults.previewImages.deleted
    const totalErrors = cleanupResults.documents.errors + cleanupResults.previewImages.errors
    
    console.log('COS文件清理完成:', {
      totalDeleted,
      totalErrors,
      cleanupResults,
      dryRun
    })
    
    return {
      success: true,
      data: {
        totalDeleted,
        totalErrors,
        details: cleanupResults,
        dryRun: dryRun
      },
      message: dryRun ? 
        `COS文件清理预览完成，发现${totalDeleted}个可清理文件` : 
        `COS文件清理完成，已删除${totalDeleted}个文件`
    }
    
  } catch (error) {
    console.error('COS文件清理失败:', error)
    return {
      success: false,
      error: error.message,
      message: 'COS文件清理失败: ' + error.message
    }
  }
}

/**
 * 清理指定目录下的过期文件
 */
async function cleanupDirectory(cos, prefix, beforeDate, result, dryRun) {
  try {
    console.log(`开始清理目录: ${prefix}，截止时间: ${beforeDate.toISOString()}`)
    
    // 列出目录下的所有文件
    const listResult = await cos.getBucket({
      Bucket: config.bucket,
      Region: config.region,
      Prefix: prefix,
      MaxKeys: 1000  // 一次最多处理1000个文件
    })
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`目录 ${prefix} 下没有文件`)
      return
    }
    
    console.log(`目录 ${prefix} 下共有 ${listResult.Contents.length} 个文件`)
    
    // 筛选出需要删除的过期文件
    const filesToDelete = listResult.Contents.filter(file => {
      const fileDate = new Date(file.LastModified)
      const shouldDelete = fileDate < beforeDate
      
      if (shouldDelete) {
        console.log(`发现过期文件: ${file.Key}, 修改时间: ${file.LastModified}`)
      }
      
      return shouldDelete
    })
    
    console.log(`目录 ${prefix} 下有 ${filesToDelete.length} 个过期文件需要清理`)
    
    // 删除过期文件
    for (const file of filesToDelete) {
      try {
        if (!dryRun) {
          await cos.deleteObject({
            Bucket: config.bucket,
            Region: config.region,
            Key: file.Key
          })
          console.log(`已删除文件: ${file.Key}`)
        } else {
          console.log(`[预览模式] 将删除文件: ${file.Key}`)
        }
        
        result.deleted++
        result.files.push({
          key: file.Key,
          size: file.Size,
          lastModified: file.LastModified,
          deleted: !dryRun
        })
        
      } catch (deleteError) {
        console.error(`删除文件失败: ${file.Key}`, deleteError)
        result.errors++
      }
    }
    
    console.log(`目录 ${prefix} 清理完成，删除: ${result.deleted}, 错误: ${result.errors}`)
    
  } catch (error) {
    console.error(`清理目录 ${prefix} 失败:`, error)
    result.errors++
    throw error
  }
}
/**
 * Word文档转PDF - 使用腾讯云数据万象文档预览服务
 * 根据官方文档：https://cloud.tencent.com/document/product/460/101391
 */
async function convertWordToPDF(wordKey, templateId) {
  try {
    console.log('=== 开始Word文档转PDF处理 ===')
    console.log('文档Key:', wordKey)
    console.log('模板ID:', templateId)
    
    // 根据官方文档构建请求URL
    // GET /<ObjectKey>?ci-process=doc-preview&dstType=pdf&sign=<sign> HTTP/1.1
    // Host: <BucketName-APPID>.cos.<Region>.myqcloud.com
    
    const queryParams = {
      'ci-process': 'doc-preview',
      'dstType': 'pdf'
    }
    
    // 构建完整的请求URL
    const baseUrl = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${wordKey}`
    const queryString = Object.keys(queryParams).map(key => `${key}=${queryParams[key]}`).join('&')
    const fullUrl = `${baseUrl}?${queryString}`
    
    console.log('请求URL:', fullUrl)
    
    // 生成正确的请求签名
    const authorization = generateDocPreviewAuthorization(config, 'GET', `/${wordKey}`, queryParams)
    console.log('生成的签名:', authorization.substring(0, 50) + '...')
    
    // 发起HTTP请求
    console.log('发起数据万象PDF转换API请求...')
    const response = await axios.get(fullUrl, {
      timeout: 60000, // PDF转换可能需要更长时间
      responseType: 'arraybuffer',
      headers: {
        'Authorization': authorization,
        'Host': `${config.bucket}.cos.${config.region}.myqcloud.com`
      }
    })
    
    console.log('=== PDF转换API响应信息 ===')
    console.log('状态码:', response.status)
    console.log('状态文本:', response.statusText)
    console.log('响应头:', JSON.stringify(response.headers, null, 2))
    
    // 检查响应头中的错误信息
    if (response.headers['x-ci-error-code']) {
      const errorCode = response.headers['x-ci-error-code']
      const errorMessage = response.headers['x-ci-error-message'] || '未知错误'
      console.error('数据万象API错误:', errorCode, errorMessage)
      throw new Error(`PDF转换失败: ${errorCode} - ${errorMessage}`)
    }
    
    // 检查响应状态
    if (response.status === 200) {
      console.log('PDF转换API调用成功')
      
      // 检查响应数据
      if (response.data && response.data.length > 0) {
        console.log('获得PDF数据，大小:', response.data.length, 'bytes')
        
        // 将PDF数据上传到云存储
        const pdfKey = `pdf_documents/${templateId}_${Date.now()}.pdf`
        console.log('开始上传PDF文档到:', pdfKey)
        
        const cos = new COS({
          SecretId: config.secretId,
          SecretKey: config.secretKey
        })
        
        const uploadResult = await new Promise((resolve, reject) => {
          cos.putObject({
            Bucket: config.bucket,
            Region: config.region,
            Key: pdfKey,
            Body: response.data,
            ContentType: 'application/pdf',
            ACL: 'public-read'  // 设置为公共读取权限
          }, (err, data) => {
            if (err) {
              console.error('PDF文档上传失败:', err)
              reject(err)
            } else {
              console.log('PDF文档上传成功:', data)
              resolve(data)
            }
          })
        })
        
        // 生成带签名的临时URL（有效期24小时）
        const signedUrl = cos.getObjectUrl({
          Bucket: config.bucket,
          Region: config.region,
          Key: pdfKey,
          Sign: true,
          Expires: 86400 // 24小时有效期
        })
        
        console.log('=== PDF转换处理完成 ===')
        console.log('PDF文档带签名URL（24小时有效）:', signedUrl)
        
        return {
          success: true,
          pdfKey: pdfKey,
          pdfUrl: signedUrl,
          fileSize: response.data.length,
          message: 'Word文档转PDF成功'
        }
      } else {
        throw new Error('API响应成功但未返回PDF数据')
      }
    } else {
      throw new Error(`API请求失败，状态码: ${response.status}, 状态文本: ${response.statusText}`)
    }
    
  } catch (error) {
    console.error('=== Word文档转PDF失败 ===')
    console.error('错误类型:', error.name)
    console.error('错误信息:', error.message)
    console.error('错误详情:', error)
    
    // 如果是axios错误，提供更详细的信息
    if (error.response) {
      console.error('API响应状态:', error.response.status)
      console.error('API响应头:', error.response.headers)
      if (error.response.data) {
        console.error('API响应数据:', error.response.data.toString().substring(0, 500))
      }
    }
    
    return {
      success: false,
      error: error.message,
      message: 'Word文档转PDF失败: ' + error.message
    }
  }
}

/**
 * 生成PDF文档
 */
async function generatePDF(event) {
  try {
    console.log('=== 生成PDF文档 ===')
    console.log('接收到的参数:', JSON.stringify(event, null, 2))
    
    const { templateId, userData, userType, wordFileKey } = event
    
    console.log('解构后的参数:')
    console.log('- templateId:', templateId)
    console.log('- userData:', userData ? 'userData存在' : 'userData不存在')
    console.log('- userType:', userType)
    console.log('- wordFileKey:', wordFileKey)
    
    // 当已提供 wordFileKey 时，可以跳过 templateId 校验（简历优化场景）
    if (!templateId && !wordFileKey) {
      throw new Error('templateId 参数缺失')
    }
    
    let finalWordKey = wordFileKey
    
    // 如果没有提供wordFileKey，需要先生成Word文档
    if (!finalWordKey) {
      console.log('没有提供wordFileKey，先生成Word文档')
      
      // 1. 下载Word模板文件
      const templateResult = await downloadTemplate({ templateId, userType })
      
      if (!templateResult.success) {
        return {
          success: false,
          templateId: templateId,
          error: templateResult.error,
          message: 'Word模板文件获取失败'
        }
      }
      
      // 2. 获取Word模板文件内容
      let templateBuffer
      
      if (templateResult.fileContent) {
        templateBuffer = templateResult.fileContent
      } else if (templateResult.tempFilePath) {
        const fs = require('fs')
        if (!fs.existsSync(templateResult.tempFilePath)) {
          throw new Error(`Word模板文件不存在: ${templateResult.tempFilePath}`)
        }
        templateBuffer = fs.readFileSync(templateResult.tempFilePath)
      } else {
        throw new Error('无法获取Word模板文件内容')
      }
      
      console.log('Word模板文件读取成功，大小:', templateBuffer.length, 'bytes')
      
      // 3. 填充用户数据到Word模板
      let processedWordBuffer = templateBuffer
      
      if (userData && Object.keys(userData).length > 0) {
        console.log('检测到用户数据，开始填充Word模板')
        processedWordBuffer = await fillWordTemplate(templateBuffer, userData)
        console.log('Word模板数据填充完成')
      }
      
      // 4. 上传处理后的Word文档到COS
      finalWordKey = `documents/${templateId}_pdf_${Date.now()}.docx`
      console.log('上传Word文档到COS:', finalWordKey)
      
      const cos = new COS({
        SecretId: config.secretId,
        SecretKey: config.secretKey
      })
      
      await new Promise((resolve, reject) => {
        cos.putObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: finalWordKey,
          Body: processedWordBuffer,
          ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }, (err, data) => {
          if (err) {
            console.error('Word文档上传失败:', err)
            reject(err)
          } else {
            console.log('Word文档上传成功:', data)
            resolve(data)
          }
        })
      })
    }
    
    // 5. 调用数据万象文档预览服务转换为PDF
    const convertResult = await convertWordToPDF(finalWordKey, templateId)
    
    console.log('Word文档转PDF结果:', convertResult)
    
    if (convertResult && convertResult.success) {
      console.log('Word文档转PDF成功')
      return {
        success: true,
        templateId: templateId,
        wordFileKey: finalWordKey,
        pdfKey: convertResult.pdfKey,
        pdfUrl: convertResult.pdfUrl,
        fileSize: convertResult.fileSize,
        message: convertResult.message
      }
    } else {
      console.error('Word文档转PDF失败')
      return {
        success: false,
        templateId: templateId,
        error: convertResult ? convertResult.error : 'Word文档转PDF失败',
        message: convertResult ? convertResult.message : 'Word文档转PDF失败，请检查数据万象服务配置'
      }
    }
    
  } catch (error) {
    console.error('生成PDF失败:', error)
    
    return {
      success: false,
      templateId: event.templateId,
      error: error.message,
      message: 'PDF生成失败: ' + error.message
    }
  }
}

// ==================== JD截屏OCR识别功能（新增）====================

/**
 * 识别岗位JD图片文字
 * @param {Object} event - 事件对象
 * @param {String} event.fileID - 云存储文件ID
 * @returns {Object} 识别结果
 */
async function recognizeJDFromImage(event) {
  try {
    const { fileID } = event
    
    if (!fileID) {
      throw new Error('缺少必要参数: fileID')
    }
    
    console.log('=== [OCR] 开始识别JD图片 ===', fileID)
    
    // 1. 从云存储下载图片
    const downloadResult = await cloud.downloadFile({
      fileID: fileID
    })
    
    const imageBuffer = downloadResult.fileContent
    const imageBase64 = imageBuffer.toString('base64')
    
    console.log('=== [OCR] 图片下载成功，大小:', imageBuffer.length, 'bytes ===')
    
    // 2. 调用腾讯云OCR API
    const tencentcloud = require('tencentcloud-sdk-nodejs')
    const OcrClient = tencentcloud.ocr.v20181119.Client
    
    // 使用现有的腾讯云配置
    const clientConfig = {
      credential: {
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
      },
      region: process.env.TENCENT_REGION || "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "ocr.tencentcloudapi.com",
        },
      },
    }
    
    const client = new OcrClient(clientConfig)
    
    // 使用通用印刷体识别（高精度版）
    const params = {
      ImageBase64: imageBase64,
      // 以下参数可选，用于提升识别效果
      IsPdf: false,
      PdfPageNumber: 1
    }
    
    console.log('=== [OCR] 调用腾讯云OCR API ===')
    
    const response = await client.GeneralAccurateOCR(params)
    
    console.log('=== [OCR] OCR识别成功 ===')
    
    // 3. 解析识别结果
    const textDetections = response.TextDetections || []
    
    // 按照位置排序（从上到下，从左到右）
    textDetections.sort((a, b) => {
      const aY = a.Polygon[0].Y
      const bY = b.Polygon[0].Y
      const aX = a.Polygon[0].X
      const bX = b.Polygon[0].X
      
      // 如果Y坐标差距小于10，认为是同一行，按X排序
      if (Math.abs(aY - bY) < 10) {
        return aX - bX
      }
      return aY - bY
    })
    
    // 提取文字内容
    const recognizedText = textDetections.map(item => item.DetectedText).join('\n')
    
    console.log('=== [OCR] 识别的文字行数:', textDetections.length, '===')
    console.log('=== [OCR] 识别文本长度:', recognizedText.length, '字符 ===')
    
    // 4. 基础文本清洗（去除特殊符号和多余空白）
    let cleanedText = recognizedText
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // 去除零宽字符
      .replace(/\s+/g, ' ') // 多个空白符替换为单个空格
      .replace(/\n\s*\n/g, '\n') // 多个换行替换为单个换行
      .trim()
    
    console.log('=== [OCR] 文本清洗完成，最终长度:', cleanedText.length, '字符 ===')
    
    return {
      success: true,
      text: cleanedText,
      originalTextLength: recognizedText.length,
      cleanedTextLength: cleanedText.length,
      textLines: textDetections.length,
      confidence: response.Angel || 0, // 图片旋转角度，可用于判断识别质量
      message: 'OCR识别成功'
    }
    
  } catch (error) {
    console.error('=== [OCR] 识别失败 ===:', error)
    
    // 详细的错误信息
    let errorMessage = error.message || '未知错误'
    
    if (error.code) {
      errorMessage = `腾讯云OCR错误 (${error.code}): ${errorMessage}`
    }
    
    return {
      success: false,
      error: errorMessage,
      message: 'OCR识别失败',
      details: {
        code: error.code,
        requestId: error.requestId
      }
    }
  }
}

// ============================================================
// 简历优化功能 - 以下为全新独立函数，不影响任何已有功能
// ============================================================

// ── 腾讯云 OCR TC3-HMAC-SHA256 签名工具（仅供 pdfToDocx 内部使用）────────────
const _crypto = require('crypto')
function _tc3Sign(key, msg) {
  return _crypto.createHmac('sha256', key).update(msg).digest()
}
/**
 * 调用腾讯云 OCR GeneralAccurateOCR，返回文字检测结果
 * 使用 TC3-HMAC-SHA256 鉴权，无需额外 SDK，仅依赖已有的 axios 和内置 crypto
 */
async function _callTencentOCR(pdfBase64, pageNumber) {
  const secretId  = config.secretId
  const secretKey = config.secretKey
  const action    = 'GeneralAccurateOCR'
  const host      = 'ocr.tencentcloudapi.com'
  const region    = 'ap-guangzhou'
  const payload   = JSON.stringify({
    ImageBase64:   pdfBase64,
    IsPdf:         true,
    PdfPageNumber: pageNumber,
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const date      = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const hashedPayload      = _crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest   = ['POST', '/', '',
    `content-type:application/json; charset=utf-8\nhost:${host}\n`,
    'content-type;host', hashedPayload].join('\n')
  const credentialScope    = `${date}/ocr/tc3_request`
  const hashedCanonical    = _crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign       = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonical].join('\n')
  const signingKey         = _tc3Sign(_tc3Sign(_tc3Sign(
    Buffer.from(`TC3${secretKey}`), date), 'ocr'), 'tc3_request')
  const signature          = _crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization      = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

  const res = await axios.post(`https://${host}`, payload, {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Host':          host,
      'X-TC-Action':   action,
      'X-TC-Version':  '2018-11-19',
      'X-TC-Region':   region,
      'X-TC-Timestamp': String(timestamp),
      'Authorization': authorization,
    },
    timeout: 30000,
  })
  if (res.data.Response.Error) throw new Error(`腾讯OCR错误: ${res.data.Response.Error.Message}`)
  return res.data.Response  // { TextDetections: [...], Angle, RequestId }
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将 PDF 文档转换为 Word 文档（.docx）
 * 方案：腾讯云 OCR（GeneralAccurateOCR）逐页提取文字 → docx 包重建段落结构
 * 优势：完全在腾讯内网调用，单页响应 < 3 秒，不受外部服务波动影响
 * 支持文字型和图片型（扫描件）PDF
 *
 * ⚠️  TODO [PDF支持待完善 - 小程序入口已暂时关闭]
 *   当前进展：
 *     - OCR 提取文字、DOCX 生成、CloudBase 上传流程已打通
 *     - extractParagraphs 已集成自动检测 PDF 并调用本函数
 *   已知问题：
 *     1. OCR 会将 PDF 内嵌的元数据（%PDF、endobj、stream 等二进制关键字）
 *        误识别为可见文字，导致预览图出现乱码
 *        → 已加置信度过滤（< 55 丢弃）+ 噪声正则过滤，但部分设计稿 PDF 仍有残留
 *     2. 设计软件导出的 PDF（文字路径化）OCR 识别率和排版还原度待进一步验证
 *     3. ConvertAPI 方案因 CloudBase HTTP 网关超时已废弃，当前为腾讯 OCR 方案
 *   恢复步骤：
 *     1. 完善 isNoise() 过滤规则，通过更多 PDF 样本测试
 *     2. 恢复 miniprogram/pages/order-submit/optimize.js chooseFile 的 PDF 入口
 *     3. 恢复 miniprogram/pages/order-submit/optimize.wxml 的文案和图标
 *     4. 更新 FIELD_HELP.resume.content 描述
 *
 * @param {object} event - { fileId: string, fileName?: string }
 */
async function pdfToDocx(event) {
  const { Document, Paragraph, TextRun, Packer } = require('docx')

  try {
    const { fileId, fileName } = event
    if (!fileId) throw new Error('fileId 参数缺失')

    console.log('[pdfToDocx] 开始 OCR 提取，fileId:', fileId)

    // 1. 下载 PDF 到内存
    const pdfBuffer = await downloadUserFile(fileId)
    const pdfBase64 = pdfBuffer.toString('base64')
    console.log('[pdfToDocx] PDF 下载完成, size:', pdfBuffer.length)

    // 2. 逐页 OCR（最多 5 页，超页数时 API 会报错，用 try-catch 停止）
    const allPages = []
    for (let page = 1; page <= 5; page++) {
      try {
        const ocrRes = await _callTencentOCR(pdfBase64, page)
        const blocks = ocrRes.TextDetections || []
        if (!blocks.length && page > 1) break   // 空页说明已超出文档页数
        allPages.push(blocks)
        console.log(`[pdfToDocx] OCR 第${page}页完成，文字块数:`, blocks.length)
      } catch (e) {
        if (page === 1) throw e   // 第一页失败直接抛出
        break                     // 后续页超界，停止
      }
    }

    if (!allPages.length || !allPages.some(p => p.length > 0)) {
      throw new Error('OCR 未识别到任何文字内容，该 PDF 可能无法处理')
    }

    // 3. 将 OCR 文字块重建为段落
    //    排序规则：先按 Y 轴（上→下），同行内按 X 轴（左→右），行距阈值 15px
    //    过滤规则：置信度 < 60 的块、PDF 元数据噪声、非打印字符 → 直接丢弃
    const PDF_NOISE_RE = /^(%PDF|%%EOF|endobj|endstream|BT\b|ET\b|\d+ \d+ obj\b|xref|trailer|startxref|\/\w+\s*<<)/i
    const NON_PRINT_RE = /^[\x00-\x1f\x7f-\x9f\s]*$/  // 全是控制字符/空白

    function isNoise(text) {
      if (!text || !text.trim()) return true
      if (NON_PRINT_RE.test(text)) return true
      if (PDF_NOISE_RE.test(text.trim())) return true
      // 超过 40% 是非中文非字母数字 → 视为乱码
      const total    = text.length
      const readable = (text.match(/[\u4e00-\u9fa5a-zA-Z0-9，。！？、；：""''（）【】\s\-\+\/]/g) || []).length
      return readable / total < 0.5
    }

    const docChildren = []
    for (const blocks of allPages) {
      if (!blocks.length) continue

      // 过滤低置信度和噪声块
      const cleanBlocks = blocks.filter(b => {
        if ((b.Confidence || 0) < 55) return false          // 置信度过低
        if (isNoise(b.DetectedText)) return false            // 噪声内容
        return true
      })
      if (!cleanBlocks.length) continue

      const sorted = cleanBlocks.slice().sort((a, b) => {
        const ay = Math.min(...a.Polygon.map(p => p.Y))
        const by = Math.min(...b.Polygon.map(p => p.Y))
        return ay - by
      })

      const lines = []
      let cur = [sorted[0]]
      let curY = Math.min(...sorted[0].Polygon.map(p => p.Y))
      for (let i = 1; i < sorted.length; i++) {
        const blk  = sorted[i]
        const blkY = Math.min(...blk.Polygon.map(p => p.Y))
        if (Math.abs(blkY - curY) < 15) {
          cur.push(blk)
        } else {
          lines.push(cur.sort((a, b) =>
            Math.min(...a.Polygon.map(p => p.X)) - Math.min(...b.Polygon.map(p => p.X))))
          cur  = [blk]
          curY = blkY
        }
      }
      if (cur.length) lines.push(cur.sort((a, b) =>
        Math.min(...a.Polygon.map(p => p.X)) - Math.min(...b.Polygon.map(p => p.X))))

      for (const line of lines) {
        const text = line.map(b => b.DetectedText).join(' ').trim()
        if (!text || isNoise(text)) continue
        // 短行（≤ 12 字）且无句末标点 → 视为标题行加粗
        const isHeading = text.length <= 12 && !/[，。；：""！？,.;]/.test(text)
        docChildren.push(new Paragraph({
          children: [new TextRun({ text, bold: isHeading, size: isHeading ? 26 : 22, font: '宋体' })],
          spacing: { line: 360, lineRule: 'auto', after: isHeading ? 100 : 40 },
        }))
      }
      // 页间插入空行
      docChildren.push(new Paragraph({ children: [] }))
    }

    // 4. 生成 DOCX
    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1134, right: 850, bottom: 1134, left: 850 } } },
        children: docChildren,
      }],
    })
    const docxBuffer = await Packer.toBuffer(doc)
    console.log('[pdfToDocx] DOCX 生成完成, size:', docxBuffer.length)

    // 5. 上传到云存储
    const baseName  = (fileName || 'resume').replace(/\.pdf$/i, '')
    const cloudPath = `pdf_converted/${Date.now()}_${baseName}.docx`
    const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: docxBuffer })
    console.log('[pdfToDocx] 转换完成，新 fileID:', uploadResult.fileID)

    return { success: true, fileId: uploadResult.fileID, fileName: `${baseName}.docx` }
  } catch (err) {
    console.error('[pdfToDocx] 转换失败:', err.message || err)
    return { success: false, error: err.message }
  }
}

/**
 * 从微信云存储下载用户上传的文件（使用 cloud.downloadFile）
 * 用户通过 wx.cloud.uploadFile 上传的文件存在微信云存储，
 * 不能用 COS SDK 直接访问，必须通过 cloud SDK 下载
 * @param {string} fileId - 微信云存储 fileID（cloud:// 格式）
 * @returns {Buffer} 文件内容
 */
async function downloadUserFile(fileId) {
  const downloadResult = await cloud.downloadFile({ fileID: fileId })
  if (!downloadResult.fileContent) throw new Error('微信云存储文件下载失败，fileContent 为空')
  return downloadResult.fileContent
}

/**
 * 提取Word文档段落列表（以段落为粒度，每段拼接所有run文本）
 * 返回带索引的段落数组，供AI进行模块识别
 * 若传入的 fileId 指向 PDF 文件，会自动调用 pdfToDocx 先转换，再提取段落
 * @param {object} event - { fileId: string（微信云存储fileID） }
 */
async function extractParagraphs(event) {
  try {
    let { fileId, fileKey } = event
    if (!fileId && !fileKey) throw new Error('fileId 参数缺失')

    // ── PDF 自动转换：若文件是 PDF，先通过 ConvertAPI 转成 DOCX 再继续 ──────────
    const isPdf = fileId && /\.pdf$/i.test(fileId)
    if (isPdf) {
      console.log('[extractParagraphs] 检测到 PDF，启动 ConvertAPI 转换...')
      const fileName = fileId.split('/').pop() || 'resume.pdf'
      const convertResult = await pdfToDocx({ fileId, fileName })
      if (!convertResult.success) throw new Error('PDF 转 DOCX 失败: ' + convertResult.error)
      fileId   = convertResult.fileId   // 替换为转换后的 DOCX fileId
      fileKey  = ''
      console.log('[extractParagraphs] PDF 转换完成，使用新 DOCX fileId:', fileId)
    }
    // ────────────────────────────────────────────────────────────────────────────

    console.log('[extractParagraphs] 开始处理文档, fileId:', fileId)

    // 优先使用 fileId（微信云存储）下载，兼容 fileKey（COS）
    let fileBuffer
    if (fileId) {
      fileBuffer = await downloadUserFile(fileId)
    } else {
      const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey, Region: config.region })
      const downloadResult = await new Promise((resolve, reject) => {
        cos.getObject({ Bucket: config.bucket, Region: config.region, Key: fileKey }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
      if (!downloadResult.Body) throw new Error('COS文档下载失败')
      fileBuffer = downloadResult.Body
    }

    // 解析docx
    const zip = new PizZip(fileBuffer)
    const docXml = zip.file('word/document.xml')
    if (!docXml) throw new Error('无法读取 word/document.xml，请确认为 .docx 格式')

    let xmlContent = docXml.asText()

    // ── 去重预处理：避免 Word 的 mc:AlternateContent 机制导致段落重复 ──
    // Word 在某些格式下会把同一段落同时存在 <mc:Choice>（新格式）和
    // <mc:Fallback>（旧格式兼容）两个区块中，正则会匹配两遍产生重复。
    // 解决方案：先剔除 <mc:Fallback> 整个区块的内容。
    xmlContent = xmlContent.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')

    // 只在 <w:body> 范围内提取，排除页眉页脚等区域
    const bodyMatch = xmlContent.match(/<w:body>[\s\S]*?<\/w:body>/)
    const scopedXml = bodyMatch ? bodyMatch[0] : xmlContent

    // 从单个 <w:p> XML 中提取纯文本（含 tab、超链接等所有 <w:t> 内容）
    const extractParaText = (pXml) => {
      let text = ''
      // 将 <w:tab/> 转为空格（制表符在 Word 中常用于排版）
      const normalized = pXml.replace(/<w:tab\/>/g, ' ')
      const tR = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
      let m
      while ((m = tR.exec(normalized)) !== null) {
        text += m[1]
      }
      // 压缩连续空格（tab 转换可能产生多余空格）
      return text.replace(/ {2,}/g, ' ').trim()
    }

    // 按 <w:p> 段落拆分，提取每个段落内所有 <w:t> 文本并拼接
    // 注意：不做文本去重，允许内容相同的多条记录都被提取
    const paragraphs = []
    const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
    let pMatch
    let idx = 0
    while ((pMatch = pRegex.exec(scopedXml)) !== null) {
      const paraText = extractParaText(pMatch[0])
      if (paraText.length > 0) {
        paragraphs.push({ idx, text: paraText })
        idx++
      }
    }

    console.log('[extractParagraphs] 共提取段落数:', paragraphs.length)

    return {
      success: true,
      paragraphs,
      totalParagraphs: paragraphs.length,
      message: '段落提取成功'
    }

  } catch (error) {
    console.error('[extractParagraphs] 失败:', error)
    return { success: false, error: error.message, message: '段落提取失败: ' + error.message }
  }
}

/**
 * 将用户上传的Word文档转为预览图
 * 先从微信云存储下载，上传到应用COS（确保文件名无中文），再调用数据万象转图
 * @param {object} event - { fileId: string }
 */
async function docToImage(event) {
  try {
    const { fileId, fileKey } = event
    if (!fileId && !fileKey) throw new Error('fileId 参数缺失')

    console.log('[docToImage] 开始转换文档为图片, fileId:', fileId)

    // Step1: 从微信云存储下载文件内容
    let fileBuffer
    if (fileId) {
      fileBuffer = await downloadUserFile(fileId)
    } else {
      const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey, Region: config.region })
      const downloadResult = await new Promise((resolve, reject) => {
        cos.getObject({ Bucket: config.bucket, Region: config.region, Key: fileKey }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
      if (!downloadResult.Body) throw new Error('COS文档下载失败')
      fileBuffer = downloadResult.Body
    }

    // Step2: 以纯ASCII文件名上传到应用COS（避免中文文件名导致URL编码问题）
    const safeKey = `enhance_temp/preview_${Date.now()}.docx`
    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey, Region: config.region })
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: safeKey,
        Body: fileBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    console.log('[docToImage] 文档已上传到COS（安全key）:', safeKey)

    // Step3: 调用数据万象转图（复用现有函数）
    const convertResult = await convertWordToImages(safeKey, `enhance_${Date.now()}`)

    if (convertResult && convertResult.success) {
      // convertWordToImages 返回 { images: [signedUrl1, signedUrl2, ...], ... }
      const previewImageUrls = convertResult.images || []
      const previewImageUrl  = previewImageUrls[0] || null
      return {
        success: true,
        previewImageUrl,
        previewImageUrls,
        message: '文档转图片成功'
      }
    } else {
      return {
        success: false,
        error: convertResult ? convertResult.error : '转换失败',
        message: '文档转图片失败'
      }
    }

  } catch (error) {
    console.error('[docToImage] 失败:', error)
    return { success: false, error: error.message, message: '文档转图片失败: ' + error.message }
  }
}

/**
 * 按段落精确替换Word文档内容（保留段落样式，只替换文本run）
 * @param {object} event - {
 *   fileId: string,              // 用户上传文档的微信云存储 fileID
 *   replacements: Array<{        // 替换对列表
 *     originalText: string,      // 原始段落文本（精确匹配）
 *     polishedText: string       // 润色后文本
 *   }>
 * }
 */
async function replaceByParagraph(event) {
  try {
    const { fileId, fileKey, replacements } = event
    if (!fileId && !fileKey) throw new Error('fileId 参数缺失')
    if (!replacements || !Array.isArray(replacements) || replacements.length === 0) {
      throw new Error('replacements 参数缺失或为空')
    }

    console.log('[replaceByParagraph] 开始处理 v2.2(删除行内换行run), fileId:', fileId, '替换条数:', replacements.length)

    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey, Region: config.region })

    // 从微信云存储下载原始文档
    let fileBuffer
    if (fileId) {
      fileBuffer = await downloadUserFile(fileId)
    } else {
      const downloadResult = await new Promise((resolve, reject) => {
        cos.getObject({ Bucket: config.bucket, Region: config.region, Key: fileKey }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
      if (!downloadResult.Body) throw new Error('原始文档下载失败')
      fileBuffer = downloadResult.Body
    }

    if (!fileBuffer) throw new Error('原始文档下载失败')

    const zip = new PizZip(fileBuffer)
    const docXmlFile = zip.file('word/document.xml')
    if (!docXmlFile) throw new Error('无法读取 word/document.xml，请确认为 .docx 格式')

    let xmlContent = docXmlFile.asText()

    // 与 extractParagraphs 保持一致：先去除 <mc:Fallback> 兼容块，避免重复替换
    // （<mc:Fallback> 是旧格式备份，去掉后文档在现代 Word 中仍可正常打开）
    xmlContent = xmlContent.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')

    // 构建替换 Map（原始文本 → { polishedText, contentFormat }）
    // 注意：同时保存 contentFormat，确保 subtitle 格式能正确生成多段落输出
    const replaceMap = {}
    for (const r of replacements) {
      if (r.originalText && r.polishedText) {
        replaceMap[r.originalText.trim()] = {
          polishedText: r.polishedText.trim(),
          contentFormat: r.contentFormat || 'paragraph'
        }
      }
    }

    // ── Step 1: 提取所有 <w:p> 段落的位置及文本 ──────────────────────────────
    // 与 extractParagraphs 保持完全一致的文本提取逻辑
    const getParaText = (pXml) => {
      // <w:tab/> → 空格（与 extractParagraphs 一致）
      const normalized = pXml.replace(/<w:tab\/>/g, ' ')
      const tR = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
      let txt = '', m
      while ((m = tR.exec(normalized)) !== null) txt += m[1]
      return txt.replace(/ {2,}/g, ' ').trim()
    }

    const allParas = []
    const pScanRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
    let pm
    while ((pm = pScanRegex.exec(xmlContent)) !== null) {
      allParas.push({ start: pm.index, end: pm.index + pm[0].length, xml: pm[0], text: getParaText(pm[0]) })
    }

    // ── Step 2: 健壮段落匹配（4 级降级策略）─────────────────────────────────
    //
    //  级别 1 — 单段落·精确匹配        （最优先，成本最低）
    //  级别 2 — 单段落·标准化匹配      （消除不可见字符/全角空格/多余空格差异）
    //  级别 3 — 多段落·精确累积匹配    （允许跳过空白段落，窗口 15 段）
    //  级别 4 — 多段落·标准化累积匹配  （上述两种宽容的组合，兜底）
    //
    // paraDecisions[i] = null | { action:'replace', polishedText } | { action:'delete' }

    // 文本标准化：去除零宽字符、统一各类空格、压缩连续空格
    const normText = (s) => s
      .replace(/[\u200b\u200c\u200d\ufeff\u00ad\u2060]/g, '')  // 零宽/软连字符
      .replace(/[\u00a0\u3000\u202f\u205f]/g, ' ')              // 不间断/全角空格 → 普通空格
      .replace(/ {2,}/g, ' ')                                   // 连续空格 → 单空格
      .trim()

    // 扁平化：去除所有空白字符（包含 \n \r \t 及各类空格），用于多段合并匹配
    // AI 提取时用 \n 拼接段落，Word 段落拼接无分隔符，flatText 消除这一差异
    const flatText = (s) => s
      .replace(/[\u200b\u200c\u200d\ufeff\u00ad\u2060]/g, '')
      .replace(/[\s\u00a0\u3000\u202f\u205f]/g, '')
      .trim()

    // 预计算每段落的标准化文本与扁平化文本
    const normParaTexts = allParas.map(p => normText(p.text))
    const flatParaTexts = allParas.map(p => flatText(p.text))

    // ─── 双字符 bigram Dice 相似度（用于近似匹配）─────────────────────────────
    // 计算两段文本的字符级 bigram 重叠率，范围 [0, 1]
    // 中文文本效果好：bigram = 相邻两字符对，对字符增删替换均敏感
    const bigramSimilarity = (a, b) => {
      if (!a || !b) return 0
      if (a === b) return 1.0
      if (a.length < 2 || b.length < 2) return 0
      const getBigrams = (str) => {
        const map = new Map()
        for (let i = 0; i < str.length - 1; i++) {
          const bg = str[i] + str[i + 1]
          map.set(bg, (map.get(bg) || 0) + 1)
        }
        return map
      }
      const mapA = getBigrams(a)
      const mapB = getBigrams(b)
      let common = 0
      for (const [bg, cnt] of mapA) {
        common += Math.min(cnt, mapB.get(bg) || 0)
      }
      // Dice: 2 * |intersection| / (|A| + |B|)
      return (2 * common) / ((a.length - 1) + (b.length - 1))
    }

    // 近似匹配相似度阈值：
    //   0.82 → 能容忍约 10% 的字符修改（AI 幻觉通常在 2%-8% 范围内）
    //   长度过滤：候选段落长度须在 origText 的 50%-200% 之间（防误命中短段落）
    const FUZZY_THRESHOLD = 0.82
    const FUZZY_THRESHOLD_MULTI = 0.80   // 多段拼合时略宽松

    // tryFindMatch：按 8 级优先级查找匹配，返回 { start, end, level, score? } 或 null
    const tryFindMatch = (origText) => {
      const normOrig = normText(origText)
      const flatOrig = flatText(origText)   // 去空白版本，用于消除 \n 分隔符差异
      const origLen = origText.length
      const normLen = normOrig.length
      const flatLen = flatOrig.length
      const WIN = 50  // 最大段落窗口（支持超长工作经历）

      // ── 精确匹配阶段 ────────────────────────────────────────────────────────

      // 级别 1：单段落精确
      for (let i = 0; i < allParas.length; i++) {
        if (allParas[i].text === origText) return { start: i, end: i, level: 1 }
      }

      // 级别 2：单段落标准化
      for (let i = 0; i < allParas.length; i++) {
        if (normParaTexts[i] === normOrig) return { start: i, end: i, level: 2 }
      }

      // 级别 3：多段落精确累积（空白段落跳过，窗口最多 WIN 段）
      for (let i = 0; i < allParas.length; i++) {
        let concat = allParas[i].text
        if (concat.length > origLen + 8) continue
        for (let j = i + 1; j < Math.min(i + WIN, allParas.length); j++) {
          const next = allParas[j].text
          if (next !== '') concat += next
          if (concat === origText) return { start: i, end: j, level: 3 }
          if (concat.length > origLen + 8) break
        }
      }

      // 级别 4：多段落标准化累积
      for (let i = 0; i < allParas.length; i++) {
        let concat = normParaTexts[i]
        if (concat.length > normLen + 8) continue
        for (let j = i + 1; j < Math.min(i + WIN, allParas.length); j++) {
          const next = normParaTexts[j]
          if (next !== '') concat += next
          if (concat === normOrig) return { start: i, end: j, level: 4 }
          if (concat.length > normLen + 8) break
        }
      }

      // 级别 7：多段落扁平化精确匹配（消除 AI 提取 \n 与文档拼接无分隔符的差异）
      // 核心：origText 用 \n 合并段落，文档段落直接拼接，flatText 双方都去掉空白后比较
      if (flatLen > 0) {
        for (let i = 0; i < allParas.length; i++) {
          let concatFlat = flatParaTexts[i]
          if (concatFlat.length > flatLen * 1.05) continue
          for (let j = i + 1; j < Math.min(i + WIN, allParas.length); j++) {
            const next = flatParaTexts[j]
            concatFlat += next
            if (concatFlat === flatOrig) {
              console.log('[replaceByParagraph] 级别7扁平化多段命中, 段[', i, '-', j, '] |', origText.substring(0, 30))
              return { start: i, end: j, level: 7 }
            }
            if (concatFlat.length > flatLen * 1.05) break
          }
        }
      }

      // ── 近似匹配阶段（AI 幻觉兜底）─────────────────────────────────────────

      // 级别 5：单段落近似匹配（bigram Dice ≥ 0.82）
      //   只在原文长度 ≥ 15 字时启用（太短的文本误命中率高）
      if (normLen >= 15) {
        let bestScore = 0
        let bestIdx = -1
        for (let i = 0; i < allParas.length; i++) {
          const pt = normParaTexts[i]
          // 长度过滤：候选长度须在 origText 的 50%-200% 之间
          if (pt.length < normLen * 0.5 || pt.length > normLen * 2.0) continue
          const score = bigramSimilarity(normOrig, pt)
          if (score > bestScore) { bestScore = score; bestIdx = i }
        }
        if (bestScore >= FUZZY_THRESHOLD && bestIdx >= 0) {
          console.log('[replaceByParagraph] 级别5近似单段命中, 相似度:', bestScore.toFixed(3), '|', origText.substring(0, 30))
          return { start: bestIdx, end: bestIdx, level: 5, score: bestScore }
        }
      }

      // 级别 6：多段落近似累积匹配（bigram Dice ≥ 0.80）
      if (normLen >= 20) {
        let bestScore = 0
        let bestStart = -1
        let bestEnd = -1
        for (let i = 0; i < allParas.length; i++) {
          let concat = normParaTexts[i]
          if (concat.length > normLen * 2.5) continue
          for (let j = i + 1; j < Math.min(i + WIN, allParas.length); j++) {
            const next = normParaTexts[j]
            if (next !== '') concat += next
            if (concat.length > normLen * 2.5) break
            if (concat.length < normLen * 0.5) continue
            const score = bigramSimilarity(normOrig, concat)
            if (score > bestScore) { bestScore = score; bestStart = i; bestEnd = j }
          }
        }
        if (bestScore >= FUZZY_THRESHOLD_MULTI && bestStart >= 0) {
          console.log('[replaceByParagraph] 级别6近似多段命中, 相似度:', bestScore.toFixed(3), '|', origText.substring(0, 30))
          return { start: bestStart, end: bestEnd, level: 6, score: bestScore }
        }
      }

      // 级别 8：扁平化近似多段匹配（bigram Dice ≥ 0.80，兜底长段落 AI 幻觉）
      if (flatLen >= 20) {
        let bestScore = 0
        let bestStart = -1
        let bestEnd = -1
        for (let i = 0; i < allParas.length; i++) {
          let concat = flatParaTexts[i]
          if (concat.length > flatLen * 2.5) continue
          for (let j = i + 1; j < Math.min(i + WIN, allParas.length); j++) {
            concat += flatParaTexts[j]
            if (concat.length > flatLen * 2.5) break
            if (concat.length < flatLen * 0.5) continue
            const score = bigramSimilarity(flatOrig, concat)
            if (score > bestScore) { bestScore = score; bestStart = i; bestEnd = j }
          }
        }
        if (bestScore >= FUZZY_THRESHOLD_MULTI && bestStart >= 0) {
          console.log('[replaceByParagraph] 级别8扁平近似多段命中, 相似度:', bestScore.toFixed(3), '|', origText.substring(0, 30))
          return { start: bestStart, end: bestEnd, level: 8, score: bestScore }
        }
      }

      return null
    }

    const paraDecisions = new Array(allParas.length).fill(null)

    console.log('[replaceByParagraph] 文档共', allParas.length, '个 <w:p> 段落')

    for (const [origText, entry] of Object.entries(replaceMap)) {
      const polishedText = entry.polishedText
      const contentFormat = entry.contentFormat || 'paragraph'
      const match = tryFindMatch(origText)
      if (match) {
        const span = match.end - match.start + 1
        console.log('[replaceByParagraph] 匹配成功 level=' + match.level
          + ' start=' + match.start + ' end=' + match.end
          + ' span=' + span + '段'
          + ' format=' + contentFormat
          + (match.score ? ' score=' + match.score.toFixed(3) : '')
          + ' | 原文前60字: ' + origText.replace(/\n/g, '↵').substring(0, 60))

        // 防止同一段落被多个 origText 重复命中（先到先得）
        if (paraDecisions[match.start] === null) {
          paraDecisions[match.start] = { action: 'replace', polishedText, contentFormat }
          for (let k = match.start + 1; k <= match.end; k++) {
            // 删除匹配范围内的所有段落（含空白段落）
            // 原有序号列表每条之间存在空白 <w:p> 作为格式分隔，内容被替换后
            // 这些空白段落若保留会在替换文本尾部产生大量空白，应一并清除
            if (paraDecisions[k] === null) {
              paraDecisions[k] = { action: 'delete' }
              const pText = allParas[k].text
              console.log('[replaceByParagraph]   → 标记删除段落[' + k + ']: "'
                + (pText.length > 0 ? pText.substring(0, 40) : '<空白段落>') + '"')
            }
          }

          // ── 防御性补漏：若为单段命中但 origText 含 \n（表明原文横跨多段），
          //    继续向后扫描，将 flatText 能与 origText 剩余部分前缀对齐的段落也标记删除
          if (match.start === match.end && origText.includes('\n')) {
            const flatOrig = flatText(origText)
            let remaining = flatOrig.slice(flatParaTexts[match.start].length)
            let k = match.start + 1
            const MAX_ORPHAN_SCAN = 60
            console.log('[replaceByParagraph]   ⚠ 单段命中但原文含换行，启动孤儿段落扫描, 剩余flat长度:', remaining.length)
            while (remaining.length > 0 && k < Math.min(match.start + MAX_ORPHAN_SCAN, allParas.length)) {
              const pFlat = flatParaTexts[k]
              if (pFlat.length === 0) {
                // 空白段落：标记删除并继续
                if (paraDecisions[k] === null) {
                  paraDecisions[k] = { action: 'delete' }
                  console.log('[replaceByParagraph]   → 孤儿扫描删除空白段落[' + k + ']')
                }
                k++
              } else if (remaining.startsWith(pFlat)) {
                // 命中：该段落是 origText 的下一段
                if (paraDecisions[k] === null) {
                  paraDecisions[k] = { action: 'delete' }
                  console.log('[replaceByParagraph]   → 孤儿扫描删除内容段落[' + k + ']: "' + allParas[k].text.substring(0, 40) + '"')
                }
                remaining = remaining.slice(pFlat.length)
                k++
              } else {
                // 不匹配，停止扫描
                console.log('[replaceByParagraph]   ✓ 孤儿扫描在段落[' + k + ']处停止，剩余remaining长度:', remaining.length)
                break
              }
            }
          }
        } else {
          console.warn('[replaceByParagraph] 段落已被其他条目占用，跳过:', origText.substring(0, 50))
        }
      } else {
        console.warn('[replaceByParagraph] 8级匹配均未命中:', origText.replace(/\n/g, '↵').substring(0, 80))
      }
    }

    // ── Step 3: 倒序修改 xmlContent（高位改动不影响低位偏移量）──────────────
    let replacedCount = 0
    let newXml = xmlContent

    /**
     * 就地修改段落文本，而非重建整个段落 XML。
     *
     * 策略：遍历段落内所有 <w:r> run：
     *   - 无 <w:t> 的 run（如 <w:br/> 行内换行）：
     *       · 首个内容 run 之前 → 原样保留
     *       · 首个内容 run 之后 → 整体删除（防止多余空白行）
     *   - 文本全为 bullet/特殊符号的 run → 原样保留
     *   - 第一个"内容 run" → 将 <w:t> 替换为润色全文
     *   - 后续"内容 run" → 整体删除（同一段落内序号列表等多行内容一并清除）
     *
     * 好处：
     *   1. 保留原段落完整属性（<w:pPr>、列表缩进 <w:numPr>、段距等）
     *   2. 保留第一个内容 run 的字体/颜色/加粗等属性（<w:rPr>）
     *   3. 保留 bullet 字符 run（◆ 等前缀不丢失）
     *   4. 清除同一 <w:p> 内的多行内容（<w:br/> 换行 run + 后续文本 run），
     *      防止替换后残留空白行
     */
    const BULLET_ONLY_RE = /^[\s◆•·■○●★☆→►▶▷✓✔※\u2022\u25a0\u25c6\u00b7\-]+$/

    // contentFormat: 'paragraph'（自然段落，默认）或 'subtitle'（小标题格式）
    // subtitle 格式下多行内容改为独立 <w:p> 输出（而非 <w:br/> 行内换行），
    // 确保每个小标题有段间距且标题部分正确加粗
    const buildNewPara = (pXml, polishedText, contentFormat) => {
      // XML 特殊字符转义工具函数
      const escXml = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

      // 按行拆分，过滤空行
      const lines = polishedText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      const isMultiLine = lines.length > 1
      // 小标题两种模式：
      //   subtitle         → 每行独立 <w:p>，有段落间距（靠左对齐）
      //   subtitle_compact → 全部在同一 <w:p>，行间用 <w:br/> 分隔（有序排列，更紧凑）
      const isSubtitleFormat        = contentFormat === 'subtitle' && isMultiLine
      const isSubtitleCompactFormat = contentFormat === 'subtitle_compact' && isMultiLine

      // 为小标题 run 构建加粗 rPr（在原始 rPr 基础上注入 <w:b/><w:bCs/>）
      // 仅小标题（全角冒号前部分）使用加粗，内容部分使用去粗版 rPr
      const buildBoldRpr = (rPrXml) => {
        if (!rPrXml) return '<w:rPr><w:b/><w:bCs/></w:rPr>'
        if (/<w:b\s*\/>/.test(rPrXml) || /<w:b\s+w:val="true"/.test(rPrXml)) return rPrXml
        return rPrXml.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>')
      }

      // 从 rPr 中去除加粗属性，用于内容部分（原始文档首个 run 通常为粗体小标题 run）
      const buildNormalRpr = (rPrXml) => {
        if (!rPrXml) return ''
        return rPrXml
          .replace(/<w:b\s*\/>/g, '')
          .replace(/<w:b\s+[^>]*\/>/g, '')
          .replace(/<w:bCs\s*\/>/g, '')
          .replace(/<w:bCs\s+[^>]*\/>/g, '')
      }

      // 将一行小标题格式文本（"小标题：内容"）拆分为两个 Word run：
      //   - 加粗 run：小标题部分（含全角冒号）
      //   - 正常 run：内容部分（已去粗）
      // 若该行不含全角冒号"："，则整行作为普通文本 run
      const buildLineRuns = (line, boldRprXml, normalRprXml) => {
        const colonIdx = line.indexOf('：')  // 只处理全角冒号，避免误切技术内容中的半角冒号
        if (colonIdx !== -1) {
          const titlePart = line.substring(0, colonIdx + 1)  // 含冒号
          const contentPart = line.substring(colonIdx + 1)
          const boldRun = `<w:r>${boldRprXml}<w:t xml:space="preserve">${escXml(titlePart)}</w:t></w:r>`
          const contentRun = contentPart
            ? `<w:r>${normalRprXml}<w:t xml:space="preserve">${escXml(contentPart)}</w:t></w:r>`
            : ''
          return boldRun + contentRun
        }
        // 无全角冒号：整行作普通文本
        return `<w:r>${normalRprXml}<w:t xml:space="preserve">${escXml(line)}</w:t></w:r>`
      }

      let firstContentDone = false
      let firstRunRprXml = ''   // 多行模式：原始首个内容 run 的 <w:rPr>（通常含粗体）
      let boldRprXml = ''       // 多行模式：加粗版 rPr，用于小标题部分
      let normalRprXml = ''     // 多行模式：去粗版 rPr，用于内容部分

      // 仅处理 <w:pPr> 之后的 run，避免误改 <w:pPr> 内部结构
      // splitIdx：<w:pPr>...</w:pPr> 结束位置（之后才是各 run）
      const pPrMatch = pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
      const splitIdx = pPrMatch
        ? pXml.indexOf(pPrMatch[0]) + pPrMatch[0].length
        : pXml.indexOf('>') + 1   // 无 pPr 时，从 <w:p> 的 > 之后开始

      const headXml = pXml.slice(0, splitIdx)   // <w:p...><w:pPr>...</w:pPr>
      const bodyXml = pXml.slice(splitIdx)       // <w:r>...</w:r>...</w:p>

      // ── 提取首个内容 run 的 rPr（两种小标题模式共用）──────────────────────
      const extractFirstRunRpr = () => {
        const runMatches = bodyXml.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []
        for (const run of runMatches) {
          const tM = run.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/)
          if (tM && !BULLET_ONLY_RE.test(tM[1])) {
            const rPrM = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)
            return rPrM ? rPrM[0] : ''
          }
        }
        return ''
      }

      // ── 小标题靠左对齐模式（subtitle）────────────────────────────────────
      // 每个小标题行生成独立 <w:p>，继承原始段落 <w:pPr>，有段落间距
      if (isSubtitleFormat) {
        const firstRunRprXml = extractFirstRunRpr()
        const boldRprXml   = buildBoldRpr(firstRunRprXml)
        const normalRprXml = buildNormalRpr(firstRunRprXml)
        return lines.map(line => {
          return headXml + buildLineRuns(line, boldRprXml, normalRprXml) + '</w:p>'
        }).join('')
      }

      // ── 小标题有序排列模式（subtitle_compact）────────────────────────────
      // 所有小标题内联拼接到同一 <w:p>，紧跟上一小标题内容之后，
      // Word 自然换行，不强制每个小标题独占一行，视觉上紧凑有序
      if (isSubtitleCompactFormat) {
        const firstRunRprXml = extractFirstRunRpr()
        const boldRprXml   = buildBoldRpr(firstRunRprXml)
        const normalRprXml = buildNormalRpr(firstRunRprXml)
        // 相邻小标题之间插入2个空格 run，提供视觉间隔
        const spaceRun = `<w:r>${normalRprXml}<w:t xml:space="preserve">  </w:t></w:r>`
        const innerXml = lines.map((line, idx) => {
          const runs = buildLineRuns(line, boldRprXml, normalRprXml)
          return idx === 0 ? runs : spaceRun + runs
        }).join('')
        return headXml + innerXml + '</w:p>'
      }

      const newBodyXml = bodyXml.replace(/<w:r[ >][\s\S]*?<\/w:r>/g, (rXml) => {
        const tM = rXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/)
        if (!tM) {
          // 无 <w:t> 的 run（如行内换行 <w:br/>）：
          //   首个内容 run 之前 → 保留（可能是 bullet 符号 run 或前置结构）
          //   首个内容 run 之后 → 删除，避免保留多余换行符撑出空白行
          return firstContentDone ? '' : rXml
        }
        const tContent = tM[1]
        if (BULLET_ONLY_RE.test(tContent)) return rXml // bullet 前缀 run，原样保留

        if (!firstContentDone) {
          firstContentDone = true
          if (isMultiLine) {
            // 多行模式：保存首个内容 run 的 rPr（原始文档首个内容 run 通常本身带粗体）
            const rPrM = rXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)
            firstRunRprXml = rPrM ? rPrM[0] : ''
            boldRprXml = buildBoldRpr(firstRunRprXml)   // 确保有加粗
            normalRprXml = buildNormalRpr(firstRunRprXml) // 去除加粗，用于内容部分
            // 第一行：拆分小标题/内容，生成加粗标题 run + 去粗内容 run
            return buildLineRuns(lines[0], boldRprXml, normalRprXml)
          }
          // 单行模式（自然段落）：保持原有行为，仅替换文本
          return rXml.replace(
            /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/,
            `<w:t xml:space="preserve">${escXml(polishedText)}</w:t>`
          )
        } else {
          // 后续内容 run：整体删除（含文本及 run 内可能存在的 <w:br/> 换行）
          // 这些 run 是同一 <w:p> 内的多行内容（序号列表、分段描述等），
          // 润色后已统一替换为第一个 run 的文本，无需保留
          return ''
        }
      })

      // 若段落内没有可用的内容 run（极端情况），降级为在段尾追加一个新 run
      if (!firstContentDone) {
        return pXml.replace('</w:p>', `<w:r><w:t xml:space="preserve">${escXml(polishedText)}</w:t></w:r></w:p>`)
      }

      // 多行模式（小标题格式）：在 </w:p> 前插入后续各行
      // 每行格式：<w:br/> 换行 + 加粗小标题 run + 去粗内容 run
      let additionalRuns = ''
      if (isMultiLine) {
        for (let i = 1; i < lines.length; i++) {
          additionalRuns += `<w:r>${firstRunRprXml}<w:br/></w:r>`
          additionalRuns += buildLineRuns(lines[i], boldRprXml, normalRprXml)
        }
      }

      const resultXml = headXml + newBodyXml
      if (additionalRuns) {
        // 在最后一个 </w:p> 前插入附加行
        const lastClose = resultXml.lastIndexOf('</w:p>')
        return lastClose !== -1
          ? resultXml.slice(0, lastClose) + additionalRuns + resultXml.slice(lastClose)
          : resultXml + additionalRuns
      }
      return resultXml
    }

    for (let i = allParas.length - 1; i >= 0; i--) {
      const d = paraDecisions[i]
      if (!d) continue
      const { start, end, xml } = allParas[i]
      if (d.action === 'delete') {
        newXml = newXml.slice(0, start) + newXml.slice(end)
      } else if (d.action === 'replace') {
        replacedCount++
        const newPXml = buildNewPara(xml, d.polishedText, d.contentFormat || 'paragraph')
        console.log('[replaceByParagraph] 替换段落:', allParas[i].text.substring(0, 30) + '...', '| 格式:', d.contentFormat || 'paragraph')
        newXml = newXml.slice(0, start) + newPXml + newXml.slice(end)
      }
    }

    console.log('[replaceByParagraph] 实际替换段落数:', replacedCount)

    // 将修改后的XML写回zip
    zip.file('word/document.xml', newXml)

    // 生成新的docx Buffer
    const newDocxBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    // 上传新文档到COS
    const newFileKey = `documents/enhanced_${Date.now()}.docx`
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: newFileKey,
        Body: newDocxBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    console.log('[replaceByParagraph] 新文档已上传:', newFileKey)

    // 生成预览图（支持多页）
    let previewImageUrl = null
    let previewImageUrls = []
    try {
      const previewResult = await convertWordToImages(newFileKey, `enhanced_${Date.now()}`)
      if (previewResult && previewResult.success) {
        previewImageUrls = previewResult.images || []
        previewImageUrl = previewImageUrls[0] || null
      }
    } catch (previewErr) {
      console.error('[replaceByParagraph] 预览图生成失败（不影响文档生成）:', previewErr.message)
    }

    // 生成临时下载链接
    let downloadUrl = null
    try {
      const tempUrlResult = await new Promise((resolve, reject) => {
        cos.getObjectUrl({
          Bucket: config.bucket,
          Region: config.region,
          Key: newFileKey,
          Expires: 7200
        }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
      downloadUrl = tempUrlResult.Url
    } catch (urlErr) {
      console.error('[replaceByParagraph] 下载链接生成失败:', urlErr.message)
    }

    return {
      success: true,
      originalFileKey: fileKey,
      newFileKey,
      downloadUrl,
      previewImageUrl,
      previewImageUrls,
      replacedCount,
      message: `文档润色完成，共替换 ${replacedCount} 个段落`
    }

  } catch (error) {
    console.error('[replaceByParagraph] 失败:', error)
    return { success: false, error: error.message, message: '段落替换失败: ' + error.message }
  }
}



// ── uploadFileFromBase64：网页版新增，处理前端上传的base64文件 ──────────────
async function _uploadFileFromBase64({ fileName, fileBase64 }) {
  try {
    const cloud = require('wx-server-sdk');
    const buffer = Buffer.from(fileBase64, 'base64');
    const cloudPath = 'web_uploads/' + Date.now() + '_' + fileName;
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer });
    return { success: true, fileID: uploadRes.fileID, fileId: uploadRes.fileID, fileKey: cloudPath, fileName };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ========== 识别创建模式云函数（独立新增，不影响其他功能）==========

/**
 * 获取识别模式专属模板（r_1~r_5）预览图的临时下载URL
 *
 * 云存储路径规则（web-2 环境）：
 *   预览图：template_all/template_{userType}_images/r_{n}.jpg
 *   Word模板：template_all/template_{userType}_word/r_{n}.docx
 *
 *   userType 映射：work → work，internship → internship，student → student
 *
 * 输入：{ userType: 'work'|'internship'|'student' }
 * 输出：{ success: true, urls: { word_r_1: '...', word_r_2: '...', ... } }
 */
async function getRecognitionTemplateUrls(event) {
  const { userType = 'internship' } = event  // 默认 internship（有图片资源）

  const templateNums = [1, 2, 3, 4, 5]
  const imageFolder  = `template_all/template_${userType}_images`

  console.log('[getRecognitionTemplateUrls] userType:', userType, '| imageFolder:', imageFolder)

  try {
    const fileEntries = templateNums.map(n => ({
      key:    `word_r_${n}`,
      fileID: `${WEB2_CLOUD_FILE_PREFIX}/${imageFolder}/r_${n}.jpg`
    }))

    console.log('[getRecognitionTemplateUrls] 请求文件列表:', fileEntries.map(f => f.fileID))

    const tempUrlResult = await cloud.getTempFileURL({
      fileList: fileEntries.map(f => f.fileID)
    })

    console.log('[getRecognitionTemplateUrls] getTempFileURL 原始结果:',
      JSON.stringify(tempUrlResult?.fileList?.map(item => ({
        fileID: item.fileID,
        hasUrl: !!item.tempFileURL,
        url: item.tempFileURL ? item.tempFileURL.substring(0, 60) + '...' : '(空)',
        status: item.status,
        errMsg: item.errMsg
      })))
    )

    const urls = {}
    if (tempUrlResult.fileList) {
      tempUrlResult.fileList.forEach((item, i) => {
        // 只收录成功的 URL（文件不存在时 tempFileURL 可能为空）
        if (item.tempFileURL) {
          urls[fileEntries[i].key] = item.tempFileURL
        }
      })
    }

    console.log('[getRecognitionTemplateUrls] 最终返回 urls 数量:', Object.keys(urls).length)

    // 若目标 userType 一张图也没有，尝试用 internship 作为降级（至少有 r_1.jpg）
    if (Object.keys(urls).length === 0 && userType !== 'internship') {
      console.log('[getRecognitionTemplateUrls] 目标 userType 无预览图，降级尝试 internship')
      return getRecognitionTemplateUrls({ ...event, userType: 'internship' })
    }

    return { success: true, urls }
  } catch (err) {
    console.error('getRecognitionTemplateUrls 失败:', err.message)
    return { success: false, message: err.message, urls: {} }
  }
}

// ================================================================


// ── 小程序端免鉴权白名单（无需 JWT 即可调用的只读/公共接口）──────────────────
const MINIPROGRAM_PUBLIC_ACTIONS = new Set([
  'getRecognitionTemplateUrls',  // 获取模板预览图 URL（公共资源）
  'extractParagraphs',           // 提取用户上传的简历文字（文件已在 web-02 环境）
])

// ── HTTP触发器入口（替换原 exports.main）──────────────────────────────────
exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch {
    return _httpRespond(400, { success: false, message: '请求体解析失败' });
  }

  // 小程序白名单接口：跳过 JWT 验证，直接处理
  if (MINIPROGRAM_PUBLIC_ACTIONS.has(body.action)) {
    try {
      const result = await _handleAction(body, context);
      return _httpRespond(200, result);
    } catch (err) {
      console.error(`word_processor_web [public] ${body.action} error:`, err);
      return _httpRespond(500, { success: false, message: '服务器错误', error: err.message });
    }
  }

  // 其余接口需要验证JWT
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return _httpRespond(401, { success: false, message: '未提供认证Token，请先登录' });
  }
  try { jwt.verify(token, JWT_SECRET); } catch {
    return _httpRespond(401, { success: false, message: 'Token无效或已过期' });
  }
  // 拦截网页版特有的 uploadFileFromBase64
  if (body.action === 'uploadFileFromBase64') {
    const result = await _uploadFileFromBase64(body);
    return _httpRespond(200, result);
  }
  try {
    const result = await _handleAction(body, context);
    return _httpRespond(200, result);
  } catch (err) {
    console.error('word_processor_web error:', err);
    return _httpRespond(500, { success: false, message: '服务器错误', error: err.message });
  }
};
